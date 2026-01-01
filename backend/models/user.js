const { pool } = require('../utils/database');
const bcrypt = require('bcrypt');

class User {
    // Create new user
    static async create(userData) {
        const { username, email, phone, password, referrer } = userData;
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Start transaction
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get referrer ID if provided
            let referrerId = null;
            if (referrer) {
                const referrerResult = await client.query(
                    'SELECT id FROM users WHERE username = $1 AND is_blocked = false',
                    [referrer]
                );
                if (referrerResult.rows.length > 0) {
                    referrerId = referrerResult.rows[0].id;
                }
            }
            
            // Create user
            const result = await client.query(`
                INSERT INTO users (username, email, phone, password_hash, referrer_id)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, user_id, username, email, phone, package_type, 
                         task_balance, affiliate_balance, welcome_bonus_claimed,
                         is_admin, is_blocked, is_verified, created_at
            `, [username, email, phone, hashedPassword, referrerId]);
            
            const user = result.rows[0];
            
            // Record transaction
            await client.query(`
                INSERT INTO transactions (user_id, type, amount, description, status)
                VALUES ($1, 'welcome_bonus', 1000, 'Welcome bonus (pending package purchase)', 'pending')
            `, [user.id]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                user: {
                    id: user.user_id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    package: user.package_type,
                    balances: {
                        task: parseFloat(user.task_balance),
                        affiliate: parseFloat(user.affiliate_balance)
                    },
                    hasPackage: user.package_type !== 'none',
                    welcomeBonusClaimed: user.welcome_bonus_claimed,
                    isAdmin: user.is_admin,
                    isBlocked: user.is_blocked,
                    isVerified: user.is_verified,
                    createdAt: user.created_at
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            
            if (error.code === '23505') { // Unique violation
                const field = error.constraint.includes('username') ? 'Username' : 'Email';
                return { success: false, error: `${field} already exists` };
            }
            
            console.error('User creation error:', error);
            return { success: false, error: 'Registration failed' };
        } finally {
            client.release();
        }
    }
    
    // Find user by credentials
    static async findByCredentials(usernameOrEmail, password) {
        try {
            const result = await pool.query(`
                SELECT id, user_id, username, email, phone, password_hash, package_type,
                       task_balance, affiliate_balance, welcome_bonus_claimed,
                       is_admin, is_blocked, is_verified, last_login
                FROM users 
                WHERE (username = $1 OR email = $1) AND is_blocked = false
            `, [usernameOrEmail]);
            
            if (result.rows.length === 0) {
                return { success: false, error: 'Invalid credentials' };
            }
            
            const user = result.rows[0];
            
            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                return { success: false, error: 'Invalid credentials' };
            }
            
            // Update last login
            await pool.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );
            
            return {
                success: true,
                user: {
                    id: user.user_id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    package: user.package_type,
                    balances: {
                        task: parseFloat(user.task_balance),
                        affiliate: parseFloat(user.affiliate_balance)
                    },
                    hasPackage: user.package_type !== 'none',
                    welcomeBonusClaimed: user.welcome_bonus_claimed,
                    isAdmin: user.is_admin,
                    isBlocked: user.is_blocked,
                    isVerified: user.is_verified,
                    lastLogin: user.last_login
                }
            };
            
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Login failed' };
        }
    }
    
    // Find user by ID
    static async findById(userId) {
        try {
            const result = await pool.query(`
                SELECT id, user_id, username, email, phone, package_type,
                       task_balance, affiliate_balance, welcome_bonus_claimed,
                       is_admin, is_blocked, is_verified, created_at
                FROM users 
                WHERE user_id = $1 AND is_blocked = false
            `, [userId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const user = result.rows[0];
            return {
                id: user.user_id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                package: user.package_type,
                balances: {
                    task: parseFloat(user.task_balance),
                    affiliate: parseFloat(user.affiliate_balance)
                },
                hasPackage: user.package_type !== 'none',
                welcomeBonusClaimed: user.welcome_bonus_claimed,
                isAdmin: user.is_admin,
                isBlocked: user.is_blocked,
                isVerified: user.is_verified,
                createdAt: user.created_at
            };
        } catch (error) {
            console.error('Find user error:', error);
            return null;
        }
    }
    
    // Get user dashboard data
    static async getDashboardData(userId) {
        try {
            const userResult = await pool.query(`
                SELECT u.user_id, u.username, u.package_type,
                       u.task_balance, u.affiliate_balance, u.welcome_bonus_claimed,
                       COUNT(DISTINCT ut.id) as total_tasks,
                       COUNT(DISTINCT r.id) as total_referrals,
                       COUNT(DISTINCT w.id) as total_withdrawals
                FROM users u
                LEFT JOIN user_tasks ut ON u.id = ut.user_id AND ut.status = 'approved'
                LEFT JOIN referrals r ON u.id = r.referrer_id AND r.status = 'completed'
                LEFT JOIN withdrawals w ON u.id = w.user_id AND w.status = 'paid'
                WHERE u.user_id = $1 AND u.is_blocked = false
                GROUP BY u.id
            `, [userId]);
            
            if (userResult.rows.length === 0) {
                return { success: false, error: 'User not found' };
            }
            
            const user = userResult.rows[0];
            
            // Get recent transactions
            const transactionsResult = await pool.query(`
                SELECT type, amount, balance_type, description, status, created_at
                FROM transactions
                WHERE user_id = (SELECT id FROM users WHERE user_id = $1)
                ORDER BY created_at DESC
                LIMIT 10
            `, [userId]);
            
            // Get referral statistics
            const referralResult = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN package_type = 'knight' THEN 1 ELSE 0 END) as knight_count,
                    SUM(CASE WHEN package_type = 'elite' THEN 1 ELSE 0 END) as elite_count,
                    COALESCE(SUM(commission_amount), 0) as total_earnings
                FROM referrals
                WHERE referrer_id = (SELECT id FROM users WHERE user_id = $1)
                AND status = 'completed'
            `, [userId]);
            
            const stats = referralResult.rows[0];
            
            return {
                success: true,
                data: {
                    user: {
                        id: user.user_id,
                        username: user.username,
                        package: user.package_type,
                        balances: {
                            task: parseFloat(user.task_balance),
                            affiliate: parseFloat(user.affiliate_balance)
                        }
                    },
                    stats: {
                        totalTasks: parseInt(user.total_tasks) || 0,
                        totalReferrals: parseInt(user.total_referrals) || 0,
                        totalWithdrawals: parseInt(user.total_withdrawals) || 0,
                        referralStats: {
                            total: parseInt(stats.total) || 0,
                            knightCount: parseInt(stats.knight_count) || 0,
                            eliteCount: parseInt(stats.elite_count) || 0,
                            totalEarnings: parseFloat(stats.total_earnings) || 0
                        }
                    },
                    recentTransactions: transactionsResult.rows.map(tx => ({
                        type: tx.type,
                        amount: parseFloat(tx.amount),
                        balanceType: tx.balance_type,
                        description: tx.description,
                        status: tx.status,
                        time: tx.created_at
                    }))
                }
            };
            
        } catch (error) {
            console.error('Dashboard data error:', error);
            return { success: false, error: 'Failed to load dashboard data' };
        }
    }
    
    // Update user balances
    static async updateBalance(userId, amount, balanceType, transactionType, description) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Update balance
            const balanceColumn = balanceType === 'task' ? 'task_balance' : 'affiliate_balance';
            const updateQuery = `
                UPDATE users 
                SET ${balanceColumn} = ${balanceColumn} + $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING id, ${balanceColumn}
            `;
            
            const updateResult = await client.query(updateQuery, [amount, userId]);
            
            if (updateResult.rows.length === 0) {
                throw new Error('User not found');
            }
            
            // Record transaction
            await client.query(`
                INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                VALUES ($1, $2, $3, $4, $5, 'completed')
                RETURNING transaction_id
            `, [
                updateResult.rows[0].id,
                transactionType,
                amount,
                balanceType,
                description
            ]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                newBalance: parseFloat(updateResult.rows[0][balanceColumn])
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Update balance error:', error);
            return { success: false, error: 'Failed to update balance' };
        } finally {
            client.release();
        }
    }
    
    // Get referral link
    static async getReferralLink(userId) {
        try {
            const result = await pool.query(
                'SELECT username FROM users WHERE user_id = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                return { success: false, error: 'User not found' };
            }
            
            const username = result.rows[0].username;
            const referralLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?ref=${username}`;
            
            return {
                success: true,
                referralLink: referralLink,
                username: username
            };
            
        } catch (error) {
            console.error('Get referral link error:', error);
            return { success: false, error: 'Failed to get referral link' };
        }
    }
    
    // Get all users (admin)
    static async getAllUsers(page = 1, limit = 10, filters = {}) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramIndex = 1;
            
            if (filters.search) {
                whereClause += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
                params.push(`%${filters.search}%`);
                paramIndex++;
            }
            
            if (filters.status) {
                if (filters.status === 'active') {
                    whereClause += ` AND is_blocked = false`;
                } else if (filters.status === 'blocked') {
                    whereClause += ` AND is_blocked = true`;
                }
            }
            
            if (filters.package) {
                whereClause += ` AND package_type = $${paramIndex}`;
                params.push(filters.package);
                paramIndex++;
            }
            
            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM users ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated users
            const usersResult = await pool.query(`
                SELECT 
                    u.user_id, u.username, u.email, u.phone, u.package_type,
                    u.task_balance, u.affiliate_balance, u.welcome_bonus_claimed,
                    u.is_admin, u.is_blocked, u.is_verified, u.created_at,
                    COUNT(DISTINCT r.id) as referral_count
                FROM users u
                LEFT JOIN referrals r ON u.id = r.referrer_id
                ${whereClause}
                GROUP BY u.id
                ORDER BY u.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);
            
            return {
                success: true,
                data: {
                    users: usersResult.rows.map(user => ({
                        id: user.user_id,
                        username: user.username,
                        email: user.email,
                        phone: user.phone,
                        package: user.package_type,
                        balances: {
                            task: parseFloat(user.task_balance),
                            affiliate: parseFloat(user.affiliate_balance)
                        },
                        welcomeBonusClaimed: user.welcome_bonus_claimed,
                        isAdmin: user.is_admin,
                        isBlocked: user.is_blocked,
                        isVerified: user.is_verified,
                        referralCount: parseInt(user.referral_count) || 0,
                        createdAt: user.created_at
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
            console.error('Get all users error:', error);
            return { success: false, error: 'Failed to get users' };
        }
    }
    
    // Update user (admin)
    static async updateUser(userId, updates) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get old values for log
            const oldValuesResult = await client.query(
                'SELECT * FROM users WHERE user_id = $1',
                [userId]
            );
            
            if (oldValuesResult.rows.length === 0) {
                throw new Error('User not found');
            }
            
            const oldValues = oldValuesResult.rows[0];
            
            // Build update query
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;
            
            if (updates.isBlocked !== undefined) {
                updateFields.push(`is_blocked = $${paramIndex}`);
                updateValues.push(updates.isBlocked);
                paramIndex++;
            }
            
            if (updates.packageType !== undefined) {
                updateFields.push(`package_type = $${paramIndex}`);
                updateValues.push(updates.packageType);
                paramIndex++;
                
                // If updating to a package and welcome bonus not claimed, add it
                if (updates.packageType !== 'none' && !oldValues.welcome_bonus_claimed) {
                    updateFields.push(`welcome_bonus_claimed = true`);
                    updateFields.push(`affiliate_balance = affiliate_balance + 1000`);
                    
                    // Record welcome bonus transaction
                    await client.query(`
                        INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                        VALUES ($1, 'welcome_bonus', 1000, 'affiliate', 'Welcome bonus', 'completed')
                    `, [oldValues.id]);
                }
            }
            
            if (updateFields.length === 0) {
                return { success: false, error: 'No updates provided' };
            }
            
            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            updateValues.push(userId);
            
            const updateQuery = `
                UPDATE users 
                SET ${updateFields.join(', ')}
                WHERE user_id = $${paramIndex}
                RETURNING *
            `;
            
            const updateResult = await client.query(updateQuery, updateValues);
            const newValues = updateResult.rows[0];
            
            // Log admin action
            await client.query(`
                INSERT INTO admin_logs (admin_id, action, table_name, record_id, old_values, new_values)
                VALUES ((SELECT id FROM users WHERE user_id = $1), $2, 'users', $3, $4, $5)
            `, [
                updates.adminId, // Admin performing the action
                'UPDATE_USER',
                oldValues.id,
                JSON.stringify({
                    is_blocked: oldValues.is_blocked,
                    package_type: oldValues.package_type,
                    welcome_bonus_claimed: oldValues.welcome_bonus_claimed,
                    affiliate_balance: oldValues.affiliate_balance
                }),
                JSON.stringify({
                    is_blocked: newValues.is_blocked,
                    package_type: newValues.package_type,
                    welcome_bonus_claimed: newValues.welcome_bonus_claimed,
                    affiliate_balance: newValues.affiliate_balance
                })
            ]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                user: {
                    id: newValues.user_id,
                    username: newValues.username,
                    email: newValues.email,
                    package: newValues.package_type,
                    isBlocked: newValues.is_blocked,
                    balances: {
                        task: parseFloat(newValues.task_balance),
                        affiliate: parseFloat(newValues.affiliate_balance)
                    },
                    welcomeBonusClaimed: newValues.welcome_bonus_claimed
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Update user error:', error);
            return { success: false, error: 'Failed to update user' };
        } finally {
            client.release();
        }
    }
}

module.exports = User;