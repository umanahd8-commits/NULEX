const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/taskController');
const { authMiddleware } = require('../middleware/auth');

// Public task listing (with authentication)
router.get('/', authMiddleware, TaskController.getAllTasks);
router.get('/:id', authMiddleware, TaskController.getTaskById);

// Task actions
router.post('/:id/start', authMiddleware, TaskController.startTask);
router.post('/:id/submit', authMiddleware, TaskController.submitTask);

// User's tasks
router.get('/user/active', authMiddleware, TaskController.getUserActiveTasks);
router.get('/user/completed', authMiddleware, TaskController.getUserCompletedTasks);

module.exports = router;