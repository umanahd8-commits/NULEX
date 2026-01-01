const { pool } = require('../utils/database');

class Task {
    // Create new task
    static async create(taskData, adminId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const result = await client.query(`
                INSERT INTO tasks (
                    title, description, reward, task_type, duration_minutes,
                    url, max_completions, requires_screenshot, requires_question,
                    verification_question, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING task_id, title, description, reward, task_type, 
                         duration_minutes, url, max_completions, current_completions,
                         requires_screenshot, requires_question, verification_question,
                         is_active, created_at
            `, [
                taskData.title,
                taskData.description,
                taskData.reward,
                taskData.taskType,
                taskData.durationMinutes,
                taskData.url,
                taskData.maxCompletions,
                taskData.requiresScreenshot,
                taskData.requiresQuestion,
                taskData.verificationQuestion,
                adminId
            ]);
            
            const task = result.rows[0];
            
            // Log admin action
            await client.query(`
                INSERT INTO admin_logs (admin_id, action, table_name, record_id)
                VALUES ($1, 'CREATE_TASK', 'tasks', $2)
            `, [adminId, task.task_id]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                task: {
                    id: task.task_id,
                    title: task.title,
                    description: task.description,
                    reward: parseFloat(task.reward),
                    type: task.task_type,
                    duration: task.duration_minutes,
                    url: task.url,
                    maxCompletions: task.max_completions,
                    currentCompletions: task.current_completions,
                    requiresScreenshot: task.requires_screenshot,
                    requiresQuestion: task.requires_question,
                    verificationQuestion: task.verification_question,
                    isActive: task.is_active,
                    createdAt: task.created_at
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Create task error:', error);
            return { success: false, error: 'Failed to create task' };
        } finally {
            client.release();
        }
    }
    
    // Get all active tasks
    static async getAllActive(filters = {}, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE is_active = true';
            const params = [];
            let paramIndex = 1;
            
            if (filters.type && filters.type !== 'all') {
                whereClause += ` AND task_type = $${paramIndex}`;
                params.push(filters.type);
                paramIndex++;
            }
            
            if (filters.search) {
                whereClause += ` AND title ILIKE $${paramIndex}`;
                params.push(`%${filters.search}%`);
                paramIndex++;
            }
            
            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM tasks ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated tasks
            const tasksResult = await pool.query(`
                SELECT 
                    task_id, title, description, reward, task_type,
                    duration_minutes, url, max_completions, current_completions,
                    requires_screenshot, requires_question, verification_question,
                    created_at,
                    ROUND((current_completions::DECIMAL / NULLIF(max_completions, 0)) * 100) as completion_rate
                FROM tasks
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);
            
            return {
                success: true,
                data: {
                    tasks: tasksResult.rows.map(task => ({
                        id: task.task_id,
                        title: task.title,
                        description: task.description,
                        reward: parseFloat(task.reward),
                        type: task.task_type,
                        duration: task.duration_minutes,
                        url: task.url,
                        maxCompletions: task.max_completions,
                        currentCompletions: task.current_completions,
                        completionRate: parseFloat(task.completion_rate) || 0,
                        requiresScreenshot: task.requires_screenshot,
                        requiresQuestion: task.requires_question,
                        verificationQuestion: task.verification_question,
                        createdAt: task.created_at
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
            console.error('Get tasks error:', error);
            return { success: false, error: 'Failed to get tasks' };
        }
    }
    
    // Get task by ID
    static async getById(taskId, userId = null) {
        try {
            const result = await pool.query(`
                SELECT 
                    t.task_id, t.title, t.description, t.reward, t.task_type,
                    t.duration_minutes, t.url, t.max_completions, t.current_completions,
                    t.requires_screenshot, t.requires_question, t.verification_question,
                    t.created_at,
                    ut.status as user_status,
                    ut.submitted_at,
                    ut.screenshot_url,
                    ut.answer
                FROM tasks t
                LEFT JOIN user_tasks ut ON t.id = ut.task_id 
                    AND ut.user_id = (SELECT id FROM users WHERE user_id = $2)
                WHERE t.task_id = $1 AND t.is_active = true
            `, [taskId, userId]);
            
            if (result.rows.length === 0) {
                return { success: false, error: 'Task not found' };
            }
            
            const task = result.rows[0];
            
            return {
                success: true,
                task: {
                    id: task.task_id,
                    title: task.title,
                    description: task.description,
                    reward: parseFloat(task.reward),
                    type: task.task_type,
                    duration: task.duration_minutes,
                    url: task.url,
                    maxCompletions: task.max_completions,
                    currentCompletions: task.current_completions,
                    requiresScreenshot: task.requires_screenshot,
                    requiresQuestion: task.requires_question,
                    verificationQuestion: task.verification_question,
                    userStatus: task.user_status,
                    submittedAt: task.submitted_at,
                    screenshotUrl: task.screenshot_url,
                    answer: task.answer,
                    createdAt: task.created_at
                }
            };
            
        } catch (error) {
            console.error('Get task error:', error);
            return { success: false, error: 'Failed to get task' };
        }
    }
    
    // Start task for user
    static async startTask(taskId, userId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Check if task exists and is active
            const taskResult = await client.query(`
                SELECT id, max_completions, current_completions
                FROM tasks 
                WHERE task_id = $1 AND is_active = true
                FOR UPDATE
            `, [taskId]);
            
            if (taskResult.rows.length === 0) {
                throw new Error('Task not found or inactive');
            }
            
            const task = taskResult.rows[0];
            
            // Check if task has available slots
            if (task.current_completions >= task.max_completions) {
                throw new Error('Task has reached maximum completions');
            }
            
            // Check if user already started/completed this task
            const userTaskResult = await client.query(`
                SELECT status FROM user_tasks 
                WHERE user_id = (SELECT id FROM users WHERE user_id = $1)
                AND task_id = $2
            `, [userId, task.id]);
            
            if (userTaskResult.rows.length > 0) {
                const status = userTaskResult.rows[0].status;
                if (status !== 'rejected') {
                    throw new Error('You have already started this task');
                }
            }
            
            // Create user task entry
            await client.query(`
                INSERT INTO user_tasks (user_id, task_id, status)
                VALUES (
                    (SELECT id FROM users WHERE user_id = $1),
                    $2,
                    'pending'
                )
                ON CONFLICT (user_id, task_id) DO UPDATE SET
                    status = 'pending',
                    submitted_at = NULL,
                    screenshot_url = NULL,
                    answer = NULL,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, task.id]);
            
            await client.query('COMMIT');
            
            return { success: true, message: 'Task started successfully' };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Start task error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to start task' 
            };
        } finally {
            client.release();
        }
    }
    
    // Submit task completion
    static async submitTask(taskId, userId, submissionData) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get task details
            const taskResult = await client.query(`
                SELECT id, reward, requires_screenshot, requires_question,
                       verification_question, max_completions, current_completions
                FROM tasks 
                WHERE task_id = $1 AND is_active = true
                FOR UPDATE
            `, [taskId]);
            
            if (taskResult.rows.length === 0) {
                throw new Error('Task not found');
            }
            
            const task = taskResult.rows[0];
            
            // Check if user has started the task
            const userTaskResult = await client.query(`
                SELECT id, status FROM user_tasks 
                WHERE user_id = (SELECT id FROM users WHERE user_id = $1)
                AND task_id = $2
            `, [userId, task.id]);
            
            if (userTaskResult.rows.length === 0) {
                throw new Error('You have not started this task');
            }
            
            if (userTaskResult.rows[0].status !== 'pending') {
                throw new Error('Task already submitted');
            }
            
            // Validate submission
            if (task.requires_screenshot && !submissionData.screenshotUrl) {
                throw new Error('Screenshot is required for this task');
            }
            
            if (task.requires_question && !submissionData.answer) {
                throw new Error('Answer is required for this task');
            }
            
            // Update user task
            await client.query(`
                UPDATE user_tasks 
                SET status = 'completed',
                    screenshot_url = $1,
                    answer = $2,
                    submitted_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [
                submissionData.screenshotUrl,
                submissionData.answer,
                userTaskResult.rows[0].id
            ]);
            
            // Increment task completions
            await client.query(`
                UPDATE tasks 
                SET current_completions = current_completions + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [task.id]);
            
            await client.query('COMMIT');
            
            return { 
                success: true, 
                message: 'Task submitted successfully. Awaiting admin approval.' 
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Submit task error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to submit task' 
            };
        } finally {
            client.release();
        }
    }
    
    // Get user's tasks
    static async getUserTasks(userId, status = null, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE ut.user_id = (SELECT id FROM users WHERE user_id = $1)';
            const params = [userId];
            let paramIndex = 2;
            
            if (status) {
                whereClause += ` AND ut.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }
            
            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM user_tasks ut ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated tasks
            const tasksResult = await pool.query(`
                SELECT 
                    t.task_id, t.title, t.description, t.reward, t.task_type,
                    t.duration_minutes, t.created_at as task_created,
                    ut.status, ut.submitted_at, ut.approved_at,
                    ut.screenshot_url, ut.answer
                FROM user_tasks ut
                JOIN tasks t ON ut.task_id = t.id
                ${whereClause}
                ORDER BY ut.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);
            
            return {
                success: true,
                data: {
                    tasks: tasksResult.rows.map(task => ({
                        id: task.task_id,
                        title: task.title,
                        description: task.description,
                        reward: parseFloat(task.reward),
                        type: task.task_type,
                        duration: task.duration_minutes,
                        status: task.status,
                        submittedAt: task.submitted_at,
                        approvedAt: task.approved_at,
                        screenshotUrl: task.screenshot_url,
                        answer: task.answer,
                        taskCreated: task.task_created
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
            console.error('Get user tasks error:', error);
            return { success: false, error: 'Failed to get user tasks' };
        }
    }
    
    // Admin: Get all tasks with filters
    static async getAllTasks(filters = {}, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramIndex = 1;
            
            if (filters.search) {
                whereClause += ` AND title ILIKE $${paramIndex}`;
                params.push(`%${filters.search}%`);
                paramIndex++;
            }
            
            if (filters.type && filters.type !== 'all') {
                whereClause += ` AND task_type = $${paramIndex}`;
                params.push(filters.type);
                paramIndex++;
            }
            
            if (filters.status === 'active') {
                whereClause += ` AND is_active = true`;
            } else if (filters.status === 'inactive') {
                whereClause += ` AND is_active = false`;
            }
            
            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM tasks ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated tasks
            const tasksResult = await pool.query(`
                SELECT 
                    t.task_id, t.title, t.description, t.reward, t.task_type,
                    t.duration_minutes, t.url, t.max_completions, t.current_completions,
                    t.requires_screenshot, t.requires_question, t.verification_question,
                    t.is_active, t.created_at,
                    u.username as created_by
                FROM tasks t
                LEFT JOIN users u ON t.created_by = u.id
                ${whereClause}
                ORDER BY t.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);
            
            return {
                success: true,
                data: {
                    tasks: tasksResult.rows.map(task => ({
                        id: task.task_id,
                        title: task.title,
                        description: task.description,
                        reward: parseFloat(task.reward),
                        type: task.task_type,
                        duration: task.duration_minutes,
                        url: task.url,
                        maxCompletions: task.max_completions,
                        currentCompletions: task.current_completions,
                        requiresScreenshot: task.requires_screenshot,
                        requiresQuestion: task.requires_question,
                        verificationQuestion: task.verification_question,
                        isActive: task.is_active,
                        createdBy: task.created_by,
                        createdAt: task.created_at
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
            console.error('Get all tasks error:', error);
            return { success: false, error: 'Failed to get tasks' };
        }
    }
    
    // Admin: Update task
    static async updateTask(taskId, updates, adminId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get old values for log
            const oldValuesResult = await client.query(
                'SELECT * FROM tasks WHERE task_id = $1',
                [taskId]
            );
            
            if (oldValuesResult.rows.length === 0) {
                throw new Error('Task not found');
            }
            
            const oldValues = oldValuesResult.rows[0];
            
            // Build update query
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;
            
            const fields = [
                'title', 'description', 'reward', 'task_type', 'duration_minutes',
                'url', 'max_completions', 'requires_screenshot', 'requires_question',
                'verification_question', 'is_active'
            ];
            
            fields.forEach(field => {
                if (updates[field] !== undefined) {
                    updateFields.push(`${field} = $${paramIndex}`);
                    updateValues.push(updates[field]);
                    paramIndex++;
                }
            });
            
            if (updateFields.length === 0) {
                return { success: false, error: 'No updates provided' };
            }
            
            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            updateValues.push(taskId);
            
            const updateQuery = `
                UPDATE tasks 
                SET ${updateFields.join(', ')}
                WHERE task_id = $${paramIndex}
                RETURNING *
            `;
            
            const updateResult = await client.query(updateQuery, updateValues);
            const newValues = updateResult.rows[0];
            
            // Log admin action
            await client.query(`
                INSERT INTO admin_logs (admin_id, action, table_name, record_id, old_values, new_values)
                VALUES ($1, 'UPDATE_TASK', 'tasks', $2, $3, $4)
            `, [
                adminId,
                oldValues.id,
                JSON.stringify({
                    title: oldValues.title,
                    reward: oldValues.reward,
                    is_active: oldValues.is_active
                }),
                JSON.stringify({
                    title: newValues.title,
                    reward: newValues.reward,
                    is_active: newValues.is_active
                })
            ]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                task: {
                    id: newValues.task_id,
                    title: newValues.title,
                    description: newValues.description,
                    reward: parseFloat(newValues.reward),
                    type: newValues.task_type,
                    isActive: newValues.is_active
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Update task error:', error);
            return { success: false, error: 'Failed to update task' };
        } finally {
            client.release();
        }
    }
    
    // Admin: Approve/reject user task
    static async reviewUserTask(userTaskId, decision, adminId, notes = null) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get user task details
            const userTaskResult = await client.query(`
                SELECT ut.id, ut.user_id, ut.task_id, ut.status,
                       t.reward, u.user_id as user_uuid
                FROM user_tasks ut
                JOIN tasks t ON ut.task_id = t.id
                JOIN users u ON ut.user_id = u.id
                WHERE ut.id = $1
                FOR UPDATE
            `, [userTaskId]);
            
            if (userTaskResult.rows.length === 0) {
                throw new Error('User task not found');
            }
            
            const userTask = userTaskResult.rows[0];
            
            if (userTask.status !== 'completed') {
                throw new Error('Task is not in completed status');
            }
            
            const newStatus = decision === 'approve' ? 'approved' : 'rejected';
            
            // Update user task
            await client.query(`
                UPDATE user_tasks 
                SET status = $1,
                    approved_at = $2,
                    approved_by = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [
                newStatus,
                decision === 'approve' ? 'NOW()' : null,
                decision === 'approve' ? adminId : null,
                userTaskId
            ]);
            
            if (decision === 'approve') {
                // Add reward to user's task balance
                await client.query(`
                    UPDATE users 
                    SET task_balance = task_balance + $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [userTask.reward, userTask.user_id]);
                
                // Record transaction
                await client.query(`
                    INSERT INTO transactions (user_id, type, amount, balance_type, description, status)
                    VALUES ($1, 'task_earning', $2, 'task', 'Task completion reward', 'completed')
                `, [userTask.user_id, userTask.reward]);
            }
            
            // Log admin action
            await client.query(`
                INSERT INTO admin_logs (admin_id, action, table_name, record_id, old_values, new_values)
                VALUES ($1, 'REVIEW_TASK', 'user_tasks', $2, $3, $4)
            `, [
                adminId,
                userTaskId,
                JSON.stringify({ status: userTask.status }),
                JSON.stringify({ status: newStatus })
            ]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                message: `Task ${decision}d successfully`,
                data: {
                    userId: userTask.user_uuid,
                    reward: userTask.reward,
                    status: newStatus
                }
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Review task error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to review task' 
            };
        } finally {
            client.release();
        }
    }
}

module.exports = Task;