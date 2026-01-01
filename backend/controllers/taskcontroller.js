const Task = require('../models/Task');

class TaskController {
    // Get all active tasks
    static async getAllTasks(req, res) {
        try {
            const { type, search, page = 1, limit = 10 } = req.query;
            
            const result = await Task.getAllActive(
                { type, search },
                parseInt(page),
                parseInt(limit)
            );
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get all tasks error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get tasks'
            });
        }
    }
    
    // Get task by ID
    static async getTaskById(req, res) {
        try {
            const { id } = req.params;
            
            const result = await Task.getById(id, req.user.id);
            
            if (!result.success) {
                return res.status(404).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get task error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get task'
            });
        }
    }
    
    // Start a task
    static async startTask(req, res) {
        try {
            const { id } = req.params;
            
            const result = await Task.startTask(id, req.user.id);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Start task error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to start task'
            });
        }
    }
    
    // Submit task completion
    static async submitTask(req, res) {
        try {
            const { id } = req.params;
            const { screenshotUrl, answer } = req.body;
            
            // Validate submission data
            const submissionData = {};
            
            if (screenshotUrl) {
                submissionData.screenshotUrl = screenshotUrl;
            }
            
            if (answer) {
                submissionData.answer = answer;
            }
            
            const result = await Task.submitTask(id, req.user.id, submissionData);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Submit task error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to submit task'
            });
        }
    }
    
    // Get user's active tasks
    static async getUserActiveTasks(req, res) {
        try {
            const { page = 1, limit = 10 } = req.query;
            
            const result = await Task.getUserTasks(
                req.user.id,
                'pending',
                parseInt(page),
                parseInt(limit)
            );
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get active tasks error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get active tasks'
            });
        }
    }
    
    // Get user's completed tasks
    static async getUserCompletedTasks(req, res) {
        try {
            const { page = 1, limit = 10 } = req.query;
            
            const result = await Task.getUserTasks(
                req.user.id,
                'approved',
                parseInt(page),
                parseInt(limit)
            );
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
            
        } catch (error) {
            console.error('Get completed tasks error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get completed tasks'
            });
        }
    }
}

module.exports = TaskController;