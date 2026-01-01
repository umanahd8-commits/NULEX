const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth');

// Protected routes
router.get('/dashboard', authMiddleware, UserController.getDashboard);
router.get('/referral-link', authMiddleware, UserController.getReferralLink);
router.get('/referral-stats', authMiddleware, UserController.getReferralStats);
router.get('/transactions', authMiddleware, UserController.getTransactions);

module.exports = router;