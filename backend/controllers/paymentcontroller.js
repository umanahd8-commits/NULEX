const KorapayClient = require('../config/korapay');
const { pool } = require('../utils/database');

class PaymentController {
    // Initialize package payment
    static async initializePackagePayment(req, res) {
        try {
            const { packageType, callbackUrl } = req.body;
            const userId = req.user.id;
            
            if (!packageType || !['knight', 'elite'].includes(packageType)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid package type'
                });
            }
            
            // Get package price from settings
            const priceResult = await pool.query(
                `SELECT setting_value FROM system_settings 
                 WHERE setting_key = $1`,
                [`${packageType}_package_price`]
            );
            
            if (priceResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Package price not configured'
                });
            }
            
            const amount = parseFloat(priceResult.rows[0].setting_value);
            
            // Generate reference
            const reference = `PKG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            
            // Initialize Korapay client
            const korapay = new KorapayClient(
                process.env.KORAPAY_SECRET_KEY,
                process.env.NODE_ENV !== 'production'
            );
            
            // Initialize payment
            const paymentData = {
                amount: amount,
                customerEmail: req.user.email,
                customerName: req.user.username,
                reference: reference,
                userId: userId,
                packageType: packageType,
                notificationUrl: `${process.env.BASE_URL}/api/payment/webhook`,
                redirectUrl: callbackUrl || `${process.env.BASE_URL}/payment-callback`
            };
            
            const korapayResult = await korapay.initializePayment(paymentData);
            
            if (!korapayResult.success) {
                return res.status(400).json({
                    success: false,
                    error: korapayResult.error
                });
            }
            
            // Save payment record to database
            const client = await pool.connect();
            
            try {
                await client.query('BEGIN');
                
                // Get user database ID
                const userResult = await client.query(
                    'SELECT id FROM users WHERE user_id = $1',
                    [userId]
                );
                
                if (userResult.rows.length === 0) {
                    throw new Error('User not found');
                }
                
                const userDbId = userResult.rows[0].id;
                
                // Create package record
                await client.query(`
                    INSERT INTO packages (
                        user_id, package_type, amount, payment_reference,
                        korapay_reference, payment_status
                    ) VALUES ($1, $2, $3, $4, $5, 'pending')
                `, [
                    userDbId,
                    packageType,
                    amount,
                    reference,
                    korapayResult.data.reference
                ]);
                
                await client.query('COMMIT');
                
                res.json({
                    success: true,
                    authorization_url: korapayResult.data.checkout_url,
                    reference: reference,
                    access_code: korapayResult.data.access_code,
                    amount: amount
                });
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            
        } catch (error) {
            console.error('Initialize payment error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to initialize payment'
            });
        }
    }
    
    // Verify payment
    static async verifyPayment(req, res) {
        try {
            const { reference } = req.params;
            
            // Get payment record
            const paymentResult = await pool.query(`
                SELECT p.*, u.user_id, u.username, u.email
                FROM packages p
                JOIN users u ON p.user_id = u.id
                WHERE p.payment_reference = $1 OR p.korapay_reference = $1
            `, [reference]);
            
            if (paymentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Payment not found'
                });
            }
            
            const payment = paymentResult.rows[0];
            
            // If already verified, return status
            if (payment.payment_status === 'success') {
                return res.json({
                    success: true,
                    status: 'success',
                    package: payment.package_type,
                    verifiedAt: payment.verified_at
                });
            }
            
            // Initialize Korapay client
            const korapay = new KorapayClient(
                process.env.KORAPAY_SECRET_KEY,
                process.env.NODE_ENV !== 'production'
            );
            
            // Verify with Korapay
            const korapayResult = await korapay.verifyPayment(payment.korapay_reference);
            
            if (!korapayResult.success) {
                return res.status(400).json({
                    success: false,
                    error: korapayResult.error
                });
            }
            
            const paymentStatus = korapayResult.data.status;
            
            // Update database based on status
            const client = await pool.connect();
            
            try {
                await client.query('BEGIN');
                
                if (paymentStatus === 'success') {
                    // Update package status
                    await client.query(`
                        UPDATE packages 
                        SET payment_status = 'success',
                            verified_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                    `, [payment.id]);
                    
                    // Update user package
                    await client.query(`
                        UPDATE users 
                        SET package_type = $1,
                            welcome_bonus_claimed = true,
                            affiliate_balance = affiliate_balance + 1000,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [payment.package_type, payment.user_id]);
                    
                    // Record welcome bonus transaction
                    await client.query(`
                        INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                        VALUES ($1, 'welcome_bonus', 1000, 'affiliate', 'Welcome bonus', 'completed')
                    `, [payment.user_id]);
                    
                    // Process referrals
                    const referralResult = await client.query(
                        `SELECT referrer_id FROM users WHERE id = $1 AND referrer_id IS NOT NULL`,
                        [payment.user_id]
                    );
                    
                    if (referralResult.rows.length > 0) {
                        const referrerId = referralResult.rows[0].referrer_id;
                        
                        // Check if referrer has a package
                        const referrerResult = await client.query(
                            `SELECT package_type FROM users WHERE id = $1 AND package_type != 'none'`,
                            [referrerId]
                        );
                        
                        if (referrerResult.rows.length > 0) {
                            const referrerPackage = referrerResult.rows[0].package_type;
                            
                            // Calculate commission
                            let commission = 0;
                            
                            if (referrerPackage === 'elite') {
                                commission = payment.package_type === 'knight' ? 1500 : 3500;
                            } else if (referrerPackage === 'knight') {
                                commission = 1500;
                            }
                            
                            if (commission > 0) {
                                // Add commission to referrer
                                await client.query(`
                                    UPDATE users 
                                    SET affiliate_balance = affiliate_balance + $1,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = $2
                                `, [commission, referrerId]);
                                
                                // Record referral
                                await client.query(`
                                    INSERT INTO referrals (referrer_id, referred_id, package_type, commission_amount, status)
                                    VALUES ($1, $2, $3, $4, 'completed')
                                `, [referrerId, payment.user_id, payment.package_type, commission]);
                                
                                // Record transaction
                                await client.query(`
                                    INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                                    VALUES ($1, 'referral', $2, 'affiliate', 'Referral commission', 'completed')
                                `, [referrerId, commission]);
                            }
                        }
                    }
                } else if (paymentStatus === 'failed') {
                    // Update package status
                    await client.query(`
                        UPDATE packages 
                        SET payment_status = 'failed',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                    `, [payment.id]);
                }
                
                await client.query('COMMIT');
                
                res.json({
                    success: true,
                    status: paymentStatus,
                    package: payment.package_type
                });
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            
        } catch (error) {
            console.error('Verify payment error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify payment'
            });
        }
    }
    
    // Korapay webhook handler
    static async webhookHandler(req, res) {
        try {
            const event = req.body;
            
            // Verify webhook signature (implement in production)
            // const signature = req.headers['x-korapay-signature'];
            // const isValid = korapay.verifyWebhookSignature(event, signature, process.env.KORAPAY_WEBHOOK_SECRET);
            
            // if (!isValid) {
            //     return res.status(400).json({ error: 'Invalid signature' });
            // }
            
            if (event.event === 'charge.success') {
                const chargeData = event.data;
                
                // Update package payment status
                const client = await pool.connect();
                
                try {
                    await client.query('BEGIN');
                    
                    // Find package by Korapay reference
                    const packageResult = await client.query(`
                        SELECT p.*, u.id as user_db_id
                        FROM packages p
                        JOIN users u ON p.user_id = u.id
                        WHERE p.korapay_reference = $1
                        FOR UPDATE
                    `, [chargeData.reference]);
                    
                    if (packageResult.rows.length > 0) {
                        const pkg = packageResult.rows[0];
                        
                        // Update package status
                        await client.query(`
                            UPDATE packages 
                            SET payment_status = 'success',
                                verified_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $1
                        `, [pkg.id]);
                        
                        // Update user package
                        await client.query(`
                            UPDATE users 
                            SET package_type = $1,
                                welcome_bonus_claimed = true,
                                affiliate_balance = affiliate_balance + 1000,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $2
                        `, [pkg.package_type, pkg.user_db_id]);
                        
                        // Record welcome bonus transaction
                        await client.query(`
                            INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                            VALUES ($1, 'welcome_bonus', 1000, 'affiliate', 'Welcome bonus', 'completed')
                        `, [pkg.user_db_id]);
                        
                        // Process referrals
                        const referralResult = await client.query(
                            `SELECT referrer_id FROM users WHERE id = $1 AND referrer_id IS NOT NULL`,
                            [pkg.user_db_id]
                        );
                        
                        if (referralResult.rows.length > 0) {
                            const referrerId = referralResult.rows[0].referrer_id;
                            
                            // Check if referrer has a package
                            const referrerResult = await client.query(
                                `SELECT package_type FROM users WHERE id = $1 AND package_type != 'none'`,
                                [referrerId]
                            );
                            
                            if (referrerResult.rows.length > 0) {
                                const referrerPackage = referrerResult.rows[0].package_type;
                                
                                // Calculate commission
                                let commission = 0;
                                
                                if (referrerPackage === 'elite') {
                                    commission = pkg.package_type === 'knight' ? 1500 : 3500;
                                } else if (referrerPackage === 'knight') {
                                    commission = 1500;
                                }
                                
                                if (commission > 0) {
                                    // Add commission to referrer
                                    await client.query(`
                                        UPDATE users 
                                        SET affiliate_balance = affiliate_balance + $1,
                                            updated_at = CURRENT_TIMESTAMP
                                        WHERE id = $2
                                    `, [commission, referrerId]);
                                    
                                    // Record referral
                                    await client.query(`
                                        INSERT INTO referrals (referrer_id, referred_id, package_type, commission_amount, status)
                                        VALUES ($1, $2, $3, $4, 'completed')
                                    `, [referrerId, pkg.user_db_id, pkg.package_type, commission]);
                                    
                                    // Record transaction
                                    await client.query(`
                                        INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                                        VALUES ($1, 'referral', $2, 'affiliate', 'Referral commission', 'completed')
                                    `, [referrerId, commission]);
                                }
                            }
                        }
                    }
                    
                    await client.query('COMMIT');
                    
                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error('Webhook processing error:', error);
                } finally {
                    client.release();
                }
            }
            
            res.status(200).json({ received: true });
            
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    }
    
    // Verify bank account
    static async verifyBankAccount(req, res) {
        try {
            const { accountNumber, bankCode } = req.body;
            
            if (!accountNumber || !bankCode) {
                return res.status(400).json({
                    success: false,
                    error: 'Account number and bank code are required'
                });
            }
            
            // Initialize Korapay client
            const korapay = new KorapayClient(
                process.env.KORAPAY_SECRET_KEY,
                process.env.NODE_ENV !== 'production'
            );
            
            // Verify bank account
            const result = await korapay.verifyBankAccount(accountNumber, bankCode);
            
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
            
            res.json({
                success: true,
                accountName: result.data.account_name,
                bankName: result.data.bank_name
            });
            
        } catch (error) {
            console.error('Verify bank account error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify bank account'
            });
        }
    }
    
    // Process withdrawal via Korapay
    static async processWithdrawal(req, res) {
        try {
            const { withdrawalId } = req.params;
            
            // Get withdrawal details
            const withdrawalResult = await pool.query(`
                SELECT w.*, u.username
                FROM withdrawals w
                JOIN users u ON w.user_id = u.id
                WHERE w.withdrawal_id = $1 AND w.status = 'approved'
            `, [withdrawalId]);
            
            if (withdrawalResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Withdrawal not found or not approved'
                });
            }
            
            const withdrawal = withdrawalResult.rows[0];
            
            // Initialize Korapay client
            const korapay = new KorapayClient(
                process.env.KORAPAY_SECRET_KEY,
                process.env.NODE_ENV !== 'production'
            );
            
            const client = await pool.connect();
            
            try {
                await client.query('BEGIN');
                
                // Create transfer recipient if not exists
                let recipientCode = withdrawal.korapay_recipient_code;
                
                if (!recipientCode) {
                    const recipientResult = await korapay.createTransferRecipient({
                        name: withdrawal.account_name,
                        accountNumber: withdrawal.account_number,
                        bankCode: withdrawal.bank_code,
                        metadata: {
                            userId: withdrawal.user_id,
                            withdrawalId: withdrawal.withdrawal_id
                        }
                    });
                    
                    if (!recipientResult.success) {
                        throw new Error(recipientResult.error);
                    }
                    
                    recipientCode = recipientResult.data.recipient_code;
                    
                    // Save recipient code
                    await client.query(`
                        UPDATE withdrawals 
                        SET korapay_recipient_code = $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE withdrawal_id = $2
                    `, [recipientCode, withdrawalId]);
                }
                
                // Generate transfer reference
                const transferReference = `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
                
                // Initiate transfer
                const transferResult = await korapay.initiateTransfer({
                    amount: withdrawal.net_amount,
                    reference: transferReference,
                    recipientCode: recipientCode,
                    reason: `Withdrawal for ${withdrawal.username}`
                });
                
                if (!transferResult.success) {
                    throw new Error(transferResult.error);
                }
                
                const transferCode = transferResult.data.transfer_code;
                
                // Update withdrawal with transfer details
                await client.query(`
                    UPDATE withdrawals 
                    SET status = 'paid',
                        korapay_transfer_code = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE withdrawal_id = $2
                `, [transferCode, withdrawalId]);
                
                // Update transaction status
                await client.query(`
                    UPDATE transactions 
                    SET status = 'completed',
                        description = CONCAT(description, ' - Processed via Korapay'),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $1 
                    AND type = 'withdrawal' 
                    AND amount = $2
                    AND created_at >= (SELECT created_at FROM withdrawals WHERE withdrawal_id = $3) - INTERVAL '1 minute'
                    AND created_at <= (SELECT created_at FROM withdrawals WHERE withdrawal_id = $3) + INTERVAL '1 minute'
                `, [withdrawal.user_id, withdrawal.amount, withdrawalId]);
                
                // Log admin action
                await client.query(`
                    INSERT INTO admin_logs (admin_id, action, table_name, record_id, old_values, new_values)
                    VALUES ((SELECT id FROM users WHERE user_id = $1), 'PROCESS_WITHDRAWAL', 'withdrawals', $2, $3, $4)
                `, [
                    req.user.id,
                    withdrawal.id,
                    JSON.stringify({ status: 'approved' }),
                    JSON.stringify({ 
                        status: 'paid',
                        korapay_transfer_code: transferCode
                    })
                ]);
                
                await client.query('COMMIT');
                
                res.json({
                    success: true,
                    message: 'Withdrawal processed successfully',
                    data: {
                        withdrawalId: withdrawalId,
                        amount: withdrawal.net_amount,
                        recipientCode: recipientCode,
                        transferCode: transferCode,
                        reference: transferReference
                    }
                });
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            
        } catch (error) {
            console.error('Process withdrawal error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to process withdrawal'
            });
        }
    }
}

module.exports = PaymentController;