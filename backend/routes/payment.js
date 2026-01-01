const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Package payment
router.post('/package/initialize', authMiddleware, PaymentController.initializePackagePayment);
router.get('/verify/:reference', authMiddleware, PaymentController.verifyPayment);

// Bank verification
router.post('/verify-bank', authMiddleware, PaymentController.verifyBankAccount);

// Korapay webhook (no authentication required)
router.post('/webhook', PaymentController.webhookHandler);

// Admin: Process withdrawal via Korapay
router.post('/withdraw/:withdrawalId/process', authMiddleware, adminMiddleware, PaymentController.processWithdrawal);

module.exports = router;