const User = require('../models/User');
const Task = require('../models/Task');
const Withdrawal = require('../models/Withdrawal');
const { pool } = require('../utils/database');

class AdminController {
    // Get dashboard statistics
    static async getDashboardStats(req, res) {
        try {
            // Get total users
            const usersResult = await pool.query(`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN is_blocked = false THEN 1 END) as active_users,
                    COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as new_today
                FROM users
            `);
            
            // Get pending withdrawals
            const withdrawalsResult = await pool.query(`
                SELECT 
                    COUNT(*) as pending_count,
                    COALESCE(SUM(amount), 0) as pending_amount
                FROM withdrawals
                WHERE status = 'pending'
            `);
            
            // Get active tasks
            const tasksResult = await pool.query(`
                SELECT 
                    COUNT(*) as active_tasks,
                    COALESCE(SUM(current_completions), 0) as today_completions
                FROM tasks
                WHERE is_active = true
            `);
            
            // Get total revenue (package purchases)
            const revenueResult = await pool.query(`
                SELECT 
                    COALESCE(SUM(amount), 0) as total_revenue,
                    COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount END), 0) as today_revenue
                FROM packages
                WHERE payment_status = 'success'
            `);
            
            const stats = {
                users: {
                    total: parseInt(usersResult.rows[0].total_users),
                    active: parseInt(usersResult.rows[0].active_users),
                    newToday: parseInt(usersResult.rows[0].new_today)
                },
                withdrawals: {
                    pending: parseInt(withdrawalsResult.rows[0].pending_count),
                    pendingAmount: parseFloat(withdrawalsResult.rows[0].pending_amount)
                },
                tasks: {
                    active: parseInt(tasksResult.rows[0].active_tasks),
                    todayCompletions: parseInt(tasksResult.rows[0].today_completions)
                },
                revenue: {
                    total: parseFloat(revenueResult.rows[0].total_revenue),
                    today: parseFloat(revenueResult.rows[0].today_revenue)
                }
            };
            
            res.json({
                success: true,
                stats
            });
            
        } catch (error) {
            console.error('Get dashboard stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get dashboard statistics'
            });
        }
    }
    
    // Get all users with pagination
    static async getUsers(req, res) {
        try {
            const { page = 1, limit = 10, search, status, package } = req.query;
            
            const result = await User.getAllUsers(
                parseInt(page),
                parseInt(limit),
                { search, status, package }
            );
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get users'
            });
        }
    }
    
    // Get user by ID
    static async getUserById(req, res) {
        try {
            const { id } = req.params;
            
            const result = await User.findById(id);
            
            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }
            
            res.json({
                success: true,
                user: result
            });
            
        } catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user'
            });
        }
    }
    
    // Update user
    static async updateUser(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Add admin ID to updates
            updates.adminId = req.user.id;
            
            const result = await User.updateUser(id, updates);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Update user error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update user'
            });
        }
    }
    
    // Get all withdrawals
    static async getWithdrawals(req, res) {
        try {
            const { page = 1, limit = 10, search, status } = req.query;
            
            const result = await Withdrawal.getAllWithdrawals(
                { search, status },
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
                error: 'Failed to get withdrawals'
            });
        }
    }
    
    // Get withdrawal by ID
    static async getWithdrawalById(req, res) {
        try {
            const { id } = req.params;
            
            const result = await Withdrawal.getById(id);
            
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
    
    // Update withdrawal status
    static async updateWithdrawalStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, adminNotes } = req.body;
            
            if (!status) {
                return res.status(400).json({
                    success: false,
                    error: 'Status is required'
                });
            }
            
            const result = await Withdrawal.updateStatus(id, {
                status,
                adminNotes
            }, req.user.id);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Update withdrawal status error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update withdrawal status'
            });
        }
    }
    
    // Get all tasks
    static async getTasks(req, res) {
        try {
            const { page = 1, limit = 10, search, type, status } = req.query;
            
            const result = await Task.getAllTasks(
                { search, type, status },
                parseInt(page),
                parseInt(limit)
            );
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get tasks error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get tasks'
            });
        }
    }
    
    // Create new task
    static async createTask(req, res) {
        try {
            const {
                title,
                description,
                reward,
                taskType,
                durationMinutes,
                url,
                maxCompletions,
                requiresScreenshot,
                requiresQuestion,
                verificationQuestion,
                steps
            } = req.body;
            
            // Validate required fields
            if (!title || !description || !reward || !taskType) {
                return res.status(400).json({
                    success: false,
                    error: 'Title, description, reward, and task type are required'
                });
            }
            
            const taskData = {
                title,
                description,
                reward: parseFloat(reward),
                taskType,
                durationMinutes: durationMinutes ? parseInt(durationMinutes) : null,
                url: url || null,
                maxCompletions: maxCompletions ? parseInt(maxCompletions) : 1000,
                requiresScreenshot: Boolean(requiresScreenshot),
                requiresQuestion: Boolean(requiresQuestion),
                verificationQuestion: verificationQuestion || null
            };
            
            const result = await Task.create(taskData, req.user.id);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.status(201).json(result);
            
        } catch (error) {
            console.error('Create task error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create task'
            });
        }
    }
    
    // Update task
    static async updateTask(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            const result = await Task.updateTask(id, updates, req.user.id);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Update task error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update task'
            });
        }
    }
    
    // Get pending user tasks for review
    static async getPendingUserTasks(req, res) {
        try {
            const { page = 1, limit = 10 } = req.query;
            const offset = (page - 1) * limit;
            
            // Get total count
            const countResult = await pool.query(`
                SELECT COUNT(*) as total 
                FROM user_tasks 
                WHERE status = 'completed'
            `);
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated pending tasks
            const tasksResult = await pool.query(`
                SELECT 
                    ut.id, ut.submitted_at, ut.screenshot_url, ut.answer,
                    t.task_id, t.title, t.reward, t.verification_question,
                    u.user_id, u.username
                FROM user_tasks ut
                JOIN tasks t ON ut.task_id = t.id
                JOIN users u ON ut.user_id = u.id
                WHERE ut.status = 'completed'
                ORDER BY ut.submitted_at ASC
                LIMIT $1 OFFSET $2
            `, [limit, offset]);
            
            res.json({
                success: true,
                data: {
                    tasks: tasksResult.rows.map(task => ({
                        id: task.id,
                        taskId: task.task_id,
                        taskTitle: task.title,
                        reward: parseFloat(task.reward),
                        userId: task.user_id,
                        username: task.username,
                        submittedAt: task.submitted_at,
                        screenshotUrl: task.screenshot_url,
                        answer: task.answer,
                        verificationQuestion: task.verification_question
                    })),
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                }
            });
            
        } catch (error) {
            console.error('Get pending tasks error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get pending tasks'
            });
        }
    }
    
    // Review user task (approve/reject)
    static async reviewUserTask(req, res) {
        try {
            const { id } = req.params;
            const { decision, notes } = req.body;
            
            if (!decision || !['approve', 'reject'].includes(decision)) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid decision (approve/reject) is required'
                });
            }
            
            const result = await Task.reviewUserTask(id, decision, req.user.id, notes);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Review task error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to review task'
            });
        }
    }
    
    // Get packages
    static async getPackages(req, res) {
        try {
            const { page = 1, limit = 10, search, status, type } = req.query;
            const offset = (page - 1) * limit;
            
            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramIndex = 1;
            
            if (search) {
                whereClause += ` AND (u.username ILIKE $${paramIndex} OR p.payment_reference ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }
            
            if (status && status !== 'all') {
                whereClause += ` AND p.payment_status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }
            
            if (type && type !== 'all') {
                whereClause += ` AND p.package_type = $${paramIndex}`;
                params.push(type);
                paramIndex++;
            }
            
            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total 
                 FROM packages p
                 JOIN users u ON p.user_id = u.id
                 ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated packages
            const packagesResult = await pool.query(`
                SELECT 
                    p.package_id, p.package_type, p.amount, p.payment_method,
                    p.payment_reference, p.payment_status, p.korapay_reference,
                    p.verified_at, p.created_at,
                    u.user_id, u.username
                FROM packages p
                JOIN users u ON p.user_id = u.id
                ${whereClause}
                ORDER BY p.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);
            
            res.json({
                success: true,
                data: {
                    packages: packagesResult.rows.map(pkg => ({
                        id: pkg.package_id,
                        type: pkg.package_type,
                        amount: parseFloat(pkg.amount),
                        paymentMethod: pkg.payment_method,
                        reference: pkg.payment_reference,
                        status: pkg.payment_status,
                        korapayReference: pkg.korapay_reference,
                        userId: pkg.user_id,
                        username: pkg.username,
                        verifiedAt: pkg.verified_at,
                        createdAt: pkg.created_at
                    })),
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                }
            });
            
        } catch (error) {
            console.error('Get packages error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get packages'
            });
        }
    }
    
    // Verify package payment
    static async verifyPackage(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            if (!status || !['success', 'failed'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid status (success/failed) is required'
                });
            }
            
            const client = await pool.connect();
            
            try {
                await client.query('BEGIN');
                
                // Get package details
                const packageResult = await client.query(`
                    SELECT p.id, p.user_id, p.package_type, p.amount,
                           u.user_id as user_uuid, u.package_type as user_package
                    FROM packages p
                    JOIN users u ON p.user_id = u.id
                    WHERE p.package_id = $1
                    FOR UPDATE
                `, [id]);
                
                if (packageResult.rows.length === 0) {
                    throw new Error('Package not found');
                }
                
                const pkg = packageResult.rows[0];
                
                // Update package status
                await client.query(`
                    UPDATE packages 
                    SET payment_status = $1,
                        verified_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE package_id = $2
                `, [status, id]);
                
                if (status === 'success') {
                    // Update user package
                    await client.query(`
                        UPDATE users 
                        SET package_type = $1,
                            welcome_bonus_claimed = true,
                            affiliate_balance = affiliate_balance + 1000,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = $2
                    `, [pkg.package_type, pkg.user_uuid]);
                    
                    // Record welcome bonus transaction
                    await client.query(`
                        INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                        VALUES ($1, 'welcome_bonus', 1000, 'affiliate', 'Welcome bonus', 'completed')
                    `, [pkg.user_id]);
                    
                    // Record package purchase transaction
                    await client.query(`
                        INSERT INTO transactions (user_id, type, amount, description, status)
                        VALUES ($1, 'package_purchase', $2, 'Package purchase', 'completed')
                    `, [pkg.user_id, pkg.amount]);
                    
                    // Process referrals if user was referred
                    const referralResult = await client.query(
                        `SELECT referrer_id FROM users WHERE id = $1 AND referrer_id IS NOT NULL`,
                        [pkg.user_id]
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
                            
                            // Calculate commission based on packages
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
                                `, [referrerId, pkg.user_id, pkg.package_type, commission]);
                                
                                // Record transaction
                                await client.query(`
                                    INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                                    VALUES ($1, 'referral', $2, 'affiliate', 'Referral commission', 'completed')
                                `, [referrerId, commission]);
                            }
                        }
                    }
                }
                
                // Log admin action
                await client.query(`
                    INSERT INTO admin_logs (admin_id, action, table_name, record_id, old_values, new_values)
                    VALUES ($1, 'VERIFY_PACKAGE', 'packages', $2, $3, $4)
                `, [
                    req.user.id,
                    pkg.id,
                    JSON.stringify({ payment_status: 'pending' }),
                    JSON.stringify({ payment_status: status })
                ]);
                
                await client.query('COMMIT');
                
                res.json({
                    success: true,
                    message: `Package ${status === 'success' ? 'verified' : 'rejected'} successfully`
                });
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            
        } catch (error) {
            console.error('Verify package error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to verify package'
            });
        }
    }
    
    // Get system settings
    static async getSettings(req, res) {
        try {
            const result = await pool.query(
                'SELECT setting_key, setting_value, description FROM system_settings ORDER BY setting_key'
            );
            
            const settings = {};
            result.rows.forEach(row => {
                settings[row.setting_key] = {
                    value: row.setting_value,
                    description: row.description
                };
            });
            
            res.json({
                success: true,
                settings
            });
            
        } catch (error) {
            console.error('Get settings error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get settings'
            });
        }
    }
    
    // Update system settings
    static async updateSettings(req, res) {
        try {
            const { settings } = req.body;
            
            if (!settings || typeof settings !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'Settings object is required'
                });
            }
            
            const client = await pool.connect();
            
            try {
                await client.query('BEGIN');
                
                // Update each setting
                for (const [key, value] of Object.entries(settings)) {
                    await client.query(`
                        UPDATE system_settings 
                        SET setting_value = $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE setting_key = $2
                    `, [value, key]);
                }
                
                // Log admin action
                await client.query(`
                    INSERT INTO admin_logs (admin_id, action, table_name, old_values, new_values)
                    VALUES ($1, 'UPDATE_SETTINGS', 'system_settings', $2, $3)
                `, [
                    req.user.id,
                    JSON.stringify({}),
                    JSON.stringify(settings)
                ]);
                
                await client.query('COMMIT');
                
                res.json({
                    success: true,
                    message: 'Settings updated successfully'
                });
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            
        } catch (error) {
            console.error('Update settings error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update settings'
            });
        }
    }
    
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
    
    // Update withdrawal portal status
    static async updatePortalStatus(req, res) {
        try {
            const { isOpen, openUntil, notes } = req.body;
            
            if (typeof isOpen !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'isOpen must be a boolean'
                });
            }
            
            const result = await Withdrawal.updatePortalStatus({
                isOpen,
                openUntil: openUntil || null,
                notes: notes || null
            }, req.user.id);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Update portal status error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update portal status'
            });
        }
    }
    
    // Get system logs
    static async getLogs(req, res) {
        try {
            const { page = 1, limit = 50, search, type } = req.query;
            const offset = (page - 1) * limit;
            
            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramIndex = 1;
            
            if (search) {
                whereClause += ` AND (action ILIKE $${paramIndex} OR table_name ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }
            
            if (type && type !== 'all') {
                whereClause += ` AND action ILIKE $${paramIndex}`;
                params.push(`%${type}%`);
                paramIndex++;
            }
            
            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM admin_logs ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated logs
            const logsResult = await pool.query(`
                SELECT 
                    al.id, al.action, al.table_name, al.record_id,
                    al.old_values, al.new_values, al.ip_address,
                    al.user_agent, al.created_at,
                    u.username as admin_username
                FROM admin_logs al
                LEFT JOIN users u ON al.admin_id = u.id
                ${whereClause}
                ORDER BY al.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);
            
            res.json({
                success: true,
                data: {
                    logs: logsResult.rows.map(log => ({
                        id: log.id,
                        action: log.action,
                        tableName: log.table_name,
                        recordId: log.record_id,
                        oldValues: log.old_values,
                        newValues: log.new_values,
                        admin: log.admin_username,
                        ipAddress: log.ip_address,
                        userAgent: log.user_agent,
                        createdAt: log.created_at
                    })),
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                }
            });
            
        } catch (error) {
            console.error('Get logs error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get system logs'
            });
        }
    }
    
    // Create database backup
    static async createBackup(req, res) {
        try {
            // In production, this would:
            // 1. Dump database to file
            // 2. Upload to cloud storage
            // 3. Record backup in logs
            
            res.json({
                success: true,
                message: 'Backup initiated. This may take a few minutes.',
                backupId: `backup-${Date.now()}`
            });
            
        } catch (error) {
            console.error('Create backup error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create backup'
            });
        }
    }
    
    // Clear system cache
    static async clearCache(req, res) {
        try {
            // In production, this would clear:
            // 1. Redis cache
            // 2. Memory cache
            // 3. File cache
            
            // Log admin action
            await pool.query(`
                INSERT INTO admin_logs (admin_id, action)
                VALUES ((SELECT id FROM users WHERE user_id = $1), 'CLEAR_CACHE')
            `, [req.user.id]);
            
            res.json({
                success: true,
                message: 'System cache cleared successfully'
            });
            
        } catch (error) {
            console.error('Clear cache error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to clear cache'
            });
        }
    }
}

module.exports = AdminController;