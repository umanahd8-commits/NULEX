const Withdrawal = require('../models/Withdrawal');

class WithdrawalController {
    // Get withdrawal portal status
    static async getPortalStatus(req, res) {
        try {
            const result = await Withdrawal.getPortalStatus();
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get portal status error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get portal status'
            });
        }
    }
    
    // Create withdrawal request
    static async createWithdrawal(req, res) {
        try {
            const { amount, balanceType, bankName, accountNumber, accountName } = req.body;
            
            // Validate required fields
            if (!amount || !balanceType || !bankName || !accountNumber || !accountName) {
                return res.status(400).json({
                    success: false,
                    error: 'All fields are required'
                });
            }
            
            // Validate amount
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid amount'
                });
            }
            
            // Validate balance type
            if (!['task', 'affiliate'].includes(balanceType)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid balance type'
                });
            }
            
            // Validate account number (Nigerian accounts are 10 digits)
            if (!/^\d{10}$/.test(accountNumber)) {
                return res.status(400).json({
                    success: false,
                    error: 'Account number must be 10 digits'
                });
            }
            
            // Create withdrawal
            const result = await Withdrawal.create({
                amount: amountNum,
                balanceType,
                bankName,
                accountNumber,
                accountName
            }, req.user.id);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.status(201).json(result);
            
        } catch (error) {
            console.error('Create withdrawal error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create withdrawal request'
            });
        }
    }
    
    // Get user's withdrawal history
    static async getUserWithdrawals(req, res) {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            
            const result = await Withdrawal.getUserWithdrawals(
                req.user.id,
                { status },
                parseInt(page),
                parseInt(limit)
            );
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get withdrawals error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get withdrawal history'
            });
        }
    }
    
    // Get withdrawal by ID
    static async getWithdrawalById(req, res) {
        try {
            const { id } = req.params;
            
            const result = await Withdrawal.getById(id, req.user.id);
            
            if (!result.success) {
                return res.status(404).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get withdrawal error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get withdrawal'
            });
        }
    }
}

module.exports = WithdrawalController;