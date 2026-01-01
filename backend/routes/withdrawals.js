const express = require('express');
const router = express.Router();
const WithdrawalController = require('../controllers/withdrawalController');
const { authMiddleware } = require('../middleware/auth');

// Get portal status
router.get('/portal-status', authMiddleware, WithdrawalController.getPortalStatus);

// Withdrawal operations
router.post('/', authMiddleware, WithdrawalController.createWithdrawal);
router.get('/', authMiddleware, WithdrawalController.getUserWithdrawals);
router.get('/:id', authMiddleware, WithdrawalController.getWithdrawalById);

module.exports = router;