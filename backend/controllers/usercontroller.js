const User = require('../models/User');
const Task = require('../models/Task');

class UserController {
    // Get user dashboard data
    static async getDashboard(req, res) {
        try {
            const result = await User.getDashboardData(req.user.id);
            
            if (!result.success) {
                return res.status(404).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get dashboard error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load dashboard data'
            });
        }
    }
    
    // Get referral link
    static async getReferralLink(req, res) {
        try {
            const result = await User.getReferralLink(req.user.id);
            
            if (!result.success) {
                return res.status(404).json(result);
            }
            
            // Get commission rates based on user's package
            const commissionRates = req.user.package === 'elite' 
                ? { knight: 1500, elite: 3500 }
                : { any: 1500 };
            
            res.json({
                success: true,
                referralLink: result.referralLink,
                username: result.username,
                commissionRates
            });
            
        } catch (error) {
            console.error('Get referral link error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get referral link'
            });
        }
    }
    
    // Get referral statistics
    static async getReferralStats(req, res) {
        try {
            // In production, this would query the database
            // For now, return mock data based on user package
            
            const mockStats = req.user.package === 'elite' 
                ? {
                    totalReferrals: 12,
                    knightReferrals: 8,
                    eliteReferrals: 4,
                    totalEarnings: 28500,
                    pendingEarnings: 0,
                    history: [
                        { date: '2024-01-15', username: 'john_doe', package: 'elite', commission: 3500, status: 'paid' },
                        { date: '2024-01-14', username: 'jane_smith', package: 'knight', commission: 1500, status: 'paid' }
                    ]
                }
                : {
                    totalReferrals: 8,
                    knightReferrals: 6,
                    eliteReferrals: 2,
                    totalEarnings: 12000,
                    pendingEarnings: 3000,
                    history: [
                        { date: '2024-01-15', username: 'user1', package: 'knight', commission: 1500, status: 'paid' },
                        { date: '2024-01-14', username: 'user2', package: 'knight', commission: 1500, status: 'paid' }
                    ]
                };
            
            res.json({
                success: true,
                stats: mockStats
            });
            
        } catch (error) {
            console.error('Get referral stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get referral statistics'
            });
        }
    }
    
    // Get user transactions
    static async getTransactions(req, res) {
        try {
            const { type, page = 1, limit = 20 } = req.query;
            
            // In production, this would query the database
            // For now, return mock data
            
            const mockTransactions = [
                { id: 1, type: 'task_earning', amount: 500, description: 'Task: Watch Video', balanceType: 'task', status: 'completed', date: '2024-01-15' },
                { id: 2, type: 'referral', amount: 3500, description: 'Referral: @john_doe (Elite)', balanceType: 'affiliate', status: 'completed', date: '2024-01-14' },
                { id: 3, type: 'withdrawal', amount: -5000, description: 'Withdrawal Request', balanceType: 'affiliate', status: 'pending', date: '2024-01-13' },
                { id: 4, type: 'welcome_bonus', amount: 1000, description: 'Welcome Bonus', balanceType: 'affiliate', status: 'completed', date: '2024-01-12' }
            ];
            
            // Filter by type if specified
            const filtered = type && type !== 'all' 
                ? mockTransactions.filter(t => t.type === type)
                : mockTransactions;
            
            // Paginate
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const startIndex = (pageNum - 1) * limitNum;
            const endIndex = startIndex + limitNum;
            const paginated = filtered.slice(startIndex, endIndex);
            
            res.json({
                success: true,
                data: {
                    transactions: paginated,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total: filtered.length,
                        totalPages: Math.ceil(filtered.length / limitNum)
                    }
                }
            });
            
        } catch (error) {
            console.error('Get transactions error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get transactions'
            });
        }
    }
    
    // Get user's tasks
    static async getUserTasks(req, res) {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            
            const result = await Task.getUserTasks(
                req.user.id, 
                status, 
                parseInt(page), 
                parseInt(limit)
            );
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get user tasks error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user tasks'
            });
        }
    }
}

module.exports = UserController;