const { pool } = require('../utils/database');

class Withdrawal {
    // Create withdrawal request
    static async create(withdrawalData, userId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Check withdrawal portal status
            const portalResult = await client.query(
                'SELECT is_open FROM withdrawal_portal ORDER BY id DESC LIMIT 1'
            );
            
            if (portalResult.rows.length === 0 || !portalResult.rows[0].is_open) {
                throw new Error('Withdrawal portal is currently closed');
            }
            
            // Get user current balance
            const userResult = await client.query(`
                SELECT id, ${withdrawalData.balanceType}_balance as balance
                FROM users 
                WHERE user_id = $1 AND is_blocked = false
                FOR UPDATE
            `, [userId]);
            
            if (userResult.rows.length === 0) {
                throw new Error('User not found or blocked');
            }
            
            const user = userResult.rows[0];
            const currentBalance = parseFloat(user.balance);
            
            // Check minimum withdrawal amount
            const settingsResult = await client.query(
                `SELECT setting_value FROM system_settings 
                 WHERE setting_key = $1`,
                [`${withdrawalData.balanceType}_min_withdrawal`]
            );
            
            const minWithdrawal = settingsResult.rows.length > 0 
                ? parseFloat(settingsResult.rows[0].setting_value) 
                : (withdrawalData.balanceType === 'affiliate' ? 1000 : 15000);
            
            if (withdrawalData.amount < minWithdrawal) {
                throw new Error(`Minimum withdrawal for ${withdrawalData.balanceType} balance is ₦${minWithdrawal}`);
            }
            
            if (withdrawalData.amount > currentBalance) {
                throw new Error('Insufficient balance');
            }
            
            // Calculate processing fee
            const feeResult = await client.query(
                `SELECT setting_value FROM system_settings 
                 WHERE setting_key = 'withdrawal_processing_fee'`
            );
            
            const feePercentage = feeResult.rows.length > 0 
                ? parseFloat(feeResult.rows[0].setting_value) 
                : 1.5;
            
            const processingFee = (withdrawalData.amount * feePercentage) / 100;
            const netAmount = withdrawalData.amount - processingFee;
            
            // Create withdrawal request
            const result = await client.query(`
                INSERT INTO withdrawals (
                    user_id, amount, balance_type, bank_name,
                    account_number, account_name, net_amount
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING withdrawal_id, amount, net_amount, balance_type,
                         bank_name, account_number, account_name, status,
                         created_at
            `, [
                user.id,
                withdrawalData.amount,
                withdrawalData.balanceType,
                withdrawalData.bankName,
                withdrawalData.accountNumber,
                withdrawalData.accountName,
                netAmount
            ]);
            
            const withdrawal = result.rows[0];
            
            // Deduct from user balance
            const balanceColumn = `${withdrawalData.balanceType}_balance`;
            await client.query(`
                UPDATE users 
                SET ${balanceColumn} = ${balanceColumn} - $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [withdrawalData.amount, user.id]);
            
            // Record transaction
            await client.query(`
                INSERT INTO transactions (
                    user_id, type, amount, balance_type, description, status
                ) VALUES ($1, 'withdrawal', $2, $3, 'Withdrawal request', 'pending')
            `, [user.id, withdrawalData.amount, withdrawalData.balanceType]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                withdrawal: {
                    id: withdrawal.withdrawal_id,
                    amount: parseFloat(withdrawal.amount),
                    netAmount: parseFloat(withdrawal.net_amount),
                    balanceType: withdrawal.balance_type,
                    bankDetails: {
                        name: withdrawal.bank_name,
                        accountNumber: withdrawal.account_number,
                        accountName: withdrawal.account_name
                    },
                    status: withdrawal.status,
                    createdAt: withdrawal.created_at
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Create withdrawal error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to create withdrawal request' 
            };
        } finally {
            client.release();
        }
    }
    
    // Get user's withdrawal history
    static async getUserWithdrawals(userId, filters = {}, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE w.user_id = (SELECT id FROM users WHERE user_id = $1)';
            const params = [userId];
            let paramIndex = 2;
            
            if (filters.status && filters.status !== 'all') {
                whereClause += ` AND w.status = $${paramIndex}`;
                params.push(filters.status);
                paramIndex++;
            }
            
            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM withdrawals w ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated withdrawals
            const withdrawalsResult = await pool.query(`
                SELECT 
                    w.withdrawal_id, w.amount, w.net_amount, w.balance_type,
                    w.bank_name, w.account_number, w.account_name,
                    w.status, w.created_at, w.processed_at,
                    u.username as processed_by
                FROM withdrawals w
                LEFT JOIN users u ON w.processed_by = u.id
                ${whereClause}
                ORDER BY w.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);
            
            return {
                success: true,
                data: {
                    withdrawals: withdrawalsResult.rows.map(w => ({
                        id: w.withdrawal_id,
                        amount: parseFloat(w.amount),
                        netAmount: parseFloat(w.net_amount),
                        balanceType: w.balance_type,
                        bankDetails: {
                            name: w.bank_name,
                            accountNumber: w.account_number,
                            accountName: w.account_name
                        },
                        status: w.status,
                        processedBy: w.processed_by,
                        createdAt: w.created_at,
                        processedAt: w.processed_at
                    })),
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                }
            };
            
        } catch (error) {
            console.error('Get withdrawals error:', error);
            return { success: false, error: 'Failed to get withdrawal history' };
        }
    }
    
    // Get withdrawal by ID
    static async getById(withdrawalId, userId = null) {
        try {
            let whereClause = 'WHERE w.withdrawal_id = $1';
            const params = [withdrawalId];
            
            if (userId) {
                whereClause += ' AND w.user_id = (SELECT id FROM users WHERE user_id = $2)';
                params.push(userId);
            }
            
            const result = await pool.query(`
                SELECT 
                    w.withdrawal_id, w.amount, w.net_amount, w.balance_type,
                    w.bank_name, w.account_number, w.account_name,
                    w.korapay_recipient_code, w.korapay_transfer_code,
                    w.status, w.admin_notes, w.created_at, w.processed_at,
                    u.user_id as user_uuid, u.username,
                    p.username as processed_by
                FROM withdrawals w
                JOIN users u ON w.user_id = u.id
                LEFT JOIN users p ON w.processed_by = p.id
                ${whereClause}
            `, params);
            
            if (result.rows.length === 0) {
                return { success: false, error: 'Withdrawal not found' };
            }
            
            const withdrawal = result.rows[0];
            
            return {
                success: true,
                withdrawal: {
                    id: withdrawal.withdrawal_id,
                    amount: parseFloat(withdrawal.amount),
                    netAmount: parseFloat(withdrawal.net_amount),
                    balanceType: withdrawal.balance_type,
                    bankDetails: {
                        name: withdrawal.bank_name,
                        accountNumber: withdrawal.account_number,
                        accountName: withdrawal.account_name
                    },
                    korapayDetails: {
                        recipientCode: withdrawal.korapay_recipient_code,
                        transferCode: withdrawal.korapay_transfer_code
                    },
                    status: withdrawal.status,
                    adminNotes: withdrawal.admin_notes,
                    user: {
                        id: withdrawal.user_uuid,
                        username: withdrawal.username
                    },
                    processedBy: withdrawal.processed_by,
                    createdAt: withdrawal.created_at,
                    processedAt: withdrawal.processed_at
                }
            };
            
        } catch (error) {
            console.error('Get withdrawal error:', error);
            return { success: false, error: 'Failed to get withdrawal' };
        }
    }
    
    // Admin: Get all withdrawals
    static async getAllWithdrawals(filters = {}, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramIndex = 1;
            
            if (filters.search) {
                whereClause += ` AND (u.username ILIKE $${paramIndex} OR w.withdrawal_id::text ILIKE $${paramIndex})`;
                params.push(`%${filters.search}%`);
                paramIndex++;
            }
            
            if (filters.status && filters.status !== 'all') {
                whereClause += ` AND w.status = $${paramIndex}`;
                params.push(filters.status);
                paramIndex++;
            }
            
            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM withdrawals w
                 JOIN users u ON w.user_id = u.id
                 ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated withdrawals
            const withdrawalsResult = await pool.query(`
                SELECT 
                    w.withdrawal_id, w.amount, w.net_amount, w.balance_type,
                    w.bank_name, w.account_number, w.account_name,
                    w.status, w.created_at, w.processed_at,
                    u.user_id as user_uuid, u.username,
                    p.username as processed_by
                FROM withdrawals w
                JOIN users u ON w.user_id = u.id
                LEFT JOIN users p ON w.processed_by = p.id
                ${whereClause}
                ORDER BY w.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);
            
            return {
                success: true,
                data: {
                    withdrawals: withdrawalsResult.rows.map(w => ({
                        id: w.withdrawal_id,
                        amount: parseFloat(w.amount),
                        netAmount: parseFloat(w.net_amount),
                        balanceType: w.balance_type,
                        bankDetails: {
                            name: w.bank_name,
                            accountNumber: w.account_number,
                            accountName: w.account_name
                        },
                        status: w.status,
                        user: {
                            id: w.user_uuid,
                            username: w.username
                        },
                        processedBy: w.processed_by,
                        createdAt: w.created_at,
                        processedAt: w.processed_at
                    })),
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                }
            };
            
        } catch (error) {
            console.error('Get all withdrawals error:', error);
            return { success: false, error: 'Failed to get withdrawals' };
        }
    }
    
    // Admin: Update withdrawal status
    static async updateStatus(withdrawalId, updates, adminId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get withdrawal details
            const withdrawalResult = await client.query(`
                SELECT w.id, w.user_id, w.amount, w.balance_type, w.status,
                       u.user_id as user_uuid
                FROM withdrawals w
                JOIN users u ON w.user_id = u.id
                WHERE w.withdrawal_id = $1
                FOR UPDATE
            `, [withdrawalId]);
            
            if (withdrawalResult.rows.length === 0) {
                throw new Error('Withdrawal not found');
            }
            
            const withdrawal = withdrawalResult.rows[0];
            const oldStatus = withdrawal.status;
            
            // Validate status transition
            if (oldStatus === 'paid' || oldStatus === 'rejected') {
                throw new Error('Cannot update a completed withdrawal');
            }
            
            if (updates.status === 'approved' && oldStatus !== 'pending') {
                throw new Error('Only pending withdrawals can be approved');
            }
            
            if (updates.status === 'rejected' && !updates.adminNotes) {
                throw new Error('Admin notes are required for rejection');
            }
            
            // Update withdrawal
            const updateResult = await client.query(`
                UPDATE withdrawals 
                SET status = $1,
                    admin_notes = $2,
                    processed_by = $3,
                    processed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE withdrawal_id = $4
                RETURNING *
            `, [
                updates.status,
                updates.adminNotes,
                adminId,
                withdrawalId
            ]);
            
            const updatedWithdrawal = updateResult.rows[0];
            
            // If rejected, refund amount to user
            if (updates.status === 'rejected') {
                const balanceColumn = `${withdrawal.balance_type}_balance`;
                await client.query(`
                    UPDATE users 
                    SET ${balanceColumn} = ${balanceColumn} + $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [withdrawal.amount, withdrawal.user_id]);
                
                // Update transaction status
                await client.query(`
                    UPDATE transactions 
                    SET status = 'failed',
                        description = CONCAT(description, ' - Rejected: ', $1)
                    WHERE user_id = $2 
                    AND type = 'withdrawal' 
                    AND amount = $3
                    AND created_at >= (SELECT created_at FROM withdrawals WHERE withdrawal_id = $4) - INTERVAL '1 minute'
                    AND created_at <= (SELECT created_at FROM withdrawals WHERE withdrawal_id = $4) + INTERVAL '1 minute'
                `, [updates.adminNotes, withdrawal.user_id, withdrawal.amount, withdrawalId]);
            }
            
            // If approved, update transaction status
            if (updates.status === 'approved') {
                await client.query(`
                    UPDATE transactions 
                    SET status = 'completed',
                        description = CONCAT(description, ' - Approved')
                    WHERE user_id = $1 
                    AND type = 'withdrawal' 
                    AND amount = $2
                    AND created_at >= (SELECT created_at FROM withdrawals WHERE withdrawal_id = $3) - INTERVAL '1 minute'
                    AND created_at <= (SELECT created_at FROM withdrawals WHERE withdrawal_id = $3) + INTERVAL '1 minute'
                `, [withdrawal.user_id, withdrawal.amount, withdrawalId]);
            }
            
            // Log admin action
            await client.query(`
                INSERT INTO admin_logs (admin_id, action, table_name, record_id, old_values, new_values)
                VALUES ($1, 'UPDATE_WITHDRAWAL', 'withdrawals', $2, $3, $4)
            `, [
                adminId,
                withdrawal.id,
                JSON.stringify({ status: oldStatus }),
                JSON.stringify({ 
                    status: updates.status,
                    admin_notes: updates.adminNotes,
                    processed_by: adminId
                })
            ]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                withdrawal: {
                    id: updatedWithdrawal.withdrawal_id,
                    status: updatedWithdrawal.status,
                    adminNotes: updatedWithdrawal.admin_notes,
                    processedAt: updatedWithdrawal.processed_at
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Update withdrawal error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to update withdrawal' 
            };
        } finally {
            client.release();
        }
    }
    
    // Admin: Process payment via Korapay
    static async processPayment(withdrawalId, korapayData, adminId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get withdrawal details
            const withdrawalResult = await client.query(`
                SELECT w.id, w.user_id, w.amount, w.net_amount, 
                       w.account_number, w.account_name, w.bank_name,
                       w.status, u.user_id as user_uuid
                FROM withdrawals w
                JOIN users u ON w.user_id = u.id
                WHERE w.withdrawal_id = $1 AND w.status = 'approved'
                FOR UPDATE
            `, [withdrawalId]);
            
            if (withdrawalResult.rows.length === 0) {
                throw new Error('Withdrawal not found or not approved');
            }
            
            const withdrawal = withdrawalResult.rows[0];
            
            // Update withdrawal with Korapay details
            const updateResult = await client.query(`
                UPDATE withdrawals 
                SET status = 'paid',
                    korapay_recipient_code = $1,
                    korapay_transfer_code = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE withdrawal_id = $3
                RETURNING *
            `, [
                korapayData.recipientCode,
                korapayData.transferCode,
                withdrawalId
            ]);
            
            // Log admin action
            await client.query(`
                INSERT INTO admin_logs (admin_id, action, table_name, record_id, old_values, new_values)
                VALUES ($1, 'PROCESS_PAYMENT', 'withdrawals', $2, $3, $4)
            `, [
                adminId,
                withdrawal.id,
                JSON.stringify({ status: 'approved' }),
                JSON.stringify({ 
                    status: 'paid',
                    korapay_recipient_code: korapayData.recipientCode,
                    korapay_transfer_code: korapayData.transferCode
                })
            ]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                message: 'Payment processed successfully',
                data: {
                    withdrawalId: withdrawalId,
                    amount: withdrawal.net_amount,
                    recipientCode: korapayData.recipientCode,
                    transferCode: korapayData.transferCode
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Process payment error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to process payment' 
            };
        } finally {
            client.release();
        }
    }
    
    // Get withdrawal portal status
    static async getPortalStatus() {
        try {
            const result = await pool.query(
                'SELECT is_open, open_until, notes FROM withdrawal_portal ORDER BY id DESC LIMIT 1'
            );
            
            if (result.rows.length === 0) {
                return {
                    success: true,
                    portal: {
                        isOpen: false,
                        openUntil: null,
                        notes: 'Portal not initialized'
                    }
                };
            }
            
            const portal = result.rows[0];
            
            return {
                success: true,
                portal: {
                    isOpen: portal.is_open,
                    openUntil: portal.open_until,
                    notes: portal.notes
                }
            };
            
        } catch (error) {
            console.error('Get portal status error:', error);
            return { success: false, error: 'Failed to get portal status' };
        }
    }
    
    // Admin: Update withdrawal portal status
    static async updatePortalStatus(updates, adminId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get current status
            const currentResult = await client.query(
                'SELECT is_open FROM withdrawal_portal ORDER BY id DESC LIMIT 1'
            );
            
            const oldStatus = currentResult.rows.length > 0 
                ? currentResult.rows[0].is_open 
                : false;
            
            // Update portal
            const result = await client.query(`
                INSERT INTO withdrawal_portal (is_open, open_until, notes, updated_by)
                VALUES ($1, $2, $3, $4)
                RETURNING is_open, open_until, notes
            `, [
                updates.isOpen,
                updates.openUntil,
                updates.notes,
                adminId
            ]);
            
            const portal = result.rows[0];
            
            // Log admin action
            await client.query(`
                INSERT INTO admin_logs (admin_id, action, table_name, record_id, old_values, new_values)
                VALUES ($1, 'UPDATE_PORTAL', 'withdrawal_portal', $2, $3, $4)
            `, [
                adminId,
                1, // portal ID
                JSON.stringify({ is_open: oldStatus }),
                JSON.stringify({ 
                    is_open: portal.is_open,
                    open_until: portal.open_until,
                    notes: portal.notes
                })
            ]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                portal: {
                    isOpen: portal.is_open,
                    openUntil: portal.open_until,
                    notes: portal.notes
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Update portal error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to update portal status' 
            };
        } finally {
            client.release();
        }
    }
}

module.exports = Withdrawal;