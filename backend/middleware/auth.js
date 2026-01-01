const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

const authMiddleware = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required' 
            });
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nulex_secret_key');
        
        // Get user from database
        const result = await pool.query(`
            SELECT u.user_id, u.username, u.email, u.package_type,
                   u.task_balance, u.affiliate_balance, u.welcome_bonus_claimed,
                   u.is_admin, u.is_blocked, u.is_verified
            FROM users u
            WHERE u.user_id = $1 AND u.is_blocked = false
        `, [decoded.userId]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not found or blocked' 
            });
        }
        
        const user = result.rows[0];
        
        // Attach user to request
        req.user = {
            id: user.user_id,
            username: user.username,
            email: user.email,
            package: user.package_type,
            balances: {
                task: parseFloat(user.task_balance),
                affiliate: parseFloat(user.affiliate_balance)
            },
            hasPackage: user.package_type !== 'none',
            welcomeBonusClaimed: user.welcome_bonus_claimed,
            isAdmin: user.is_admin,
            isVerified: user.is_verified
        };
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid token' 
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                error: 'Token expired' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            error: 'Authentication failed' 
        });
    }
};

const adminMiddleware = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ 
            success: false, 
            error: 'Admin access required' 
        });
    }
    next();
};

module.exports = { authMiddleware, adminMiddleware };