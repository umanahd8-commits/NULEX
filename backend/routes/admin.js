const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// All admin routes require authentication and admin privileges
router.use(authMiddleware, adminMiddleware);

// Dashboard statistics
router.get('/stats', AdminController.getDashboardStats);

// User management
router.get('/users', AdminController.getUsers);
router.get('/users/:id', AdminController.getUserById);
router.put('/users/:id', AdminController.updateUser);

// Withdrawal management
router.get('/withdrawals', AdminController.getWithdrawals);
router.get('/withdrawals/:id', AdminController.getWithdrawalById);
router.put('/withdrawals/:id/status', AdminController.updateWithdrawalStatus);

// Task management
router.get('/tasks', AdminController.getTasks);
router.post('/tasks', AdminController.createTask);
router.put('/tasks/:id', AdminController.updateTask);
router.get('/user-tasks/pending', AdminController.getPendingUserTasks);
router.put('/user-tasks/:id/review', AdminController.reviewUserTask);

// Package management
router.get('/packages', AdminController.getPackages);
router.put('/packages/:id/verify', AdminController.verifyPackage);

// System settings
router.get('/settings', AdminController.getSettings);
router.put('/settings', AdminController.updateSettings);
router.get('/portal-status', AdminController.getPortalStatus);
router.put('/portal-status', AdminController.updatePortalStatus);

// System logs
router.get('/logs', AdminController.getLogs);

// System operations
router.post('/backup', AdminController.createBackup);
router.post('/clear-cache', AdminController.clearCache);

module.exports = router;