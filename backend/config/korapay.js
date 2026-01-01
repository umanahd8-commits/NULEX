const axios = require('axios');

class KorapayClient {
    constructor(secretKey, isTest = true) {
        this.secretKey = secretKey;
        this.isTest = isTest;
        this.baseURL = isTest 
            ? 'https://api.korapay.com/merchant/api/v1'
            : 'https://api.korapay.com/merchant/api/v1';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
    }

    // Initialize payment for package purchase
    async initializePayment(data) {
        try {
            const paymentData = {
                amount: parseFloat(data.amount),
                currency: "NGN",
                reference: data.reference,
                customer: {
                    name: data.customerName || "NULEX User",
                    email: data.customerEmail
                },
                metadata: {
                    userId: data.userId,
                    packageType: data.packageType,
                    type: "package_purchase"
                },
                notification_url: data.notificationUrl,
                redirect_url: data.redirectUrl
            };

            const response = await this.client.post('/charges', paymentData);
            
            return {
                success: true,
                data: response.data.data,
                message: response.data.message
            };
            
        } catch (error) {
            console.error('Korapay Payment Error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Payment initialization failed'
            };
        }
    }

    // Verify payment
    async verifyPayment(reference) {
        try {
            const response = await this.client.get(`/charges/${reference}`);
            
            return {
                success: true,
                data: response.data.data,
                message: response.data.message
            };
            
        } catch (error) {
            console.error('Korapay Verification Error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Payment verification failed'
            };
        }
    }

    // Verify bank account
    async verifyBankAccount(accountNumber, bankCode) {
        try {
            const response = await this.client.post('/bank_accounts/validate', {
                account_number: accountNumber,
                bank_code: bankCode
            });
            
            return {
                success: true,
                data: response.data.data,
                message: response.data.message
            };
            
        } catch (error) {
            console.error('Korapay Bank Verification Error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Bank account verification failed'
            };
        }
    }

    // Create transfer recipient
    async createTransferRecipient(data) {
        try {
            const response = await this.client.post('/transfer_recipients', {
                type: "nuban",
                name: data.name,
                account_number: data.accountNumber,
                bank_code: data.bankCode,
                currency: "NGN",
                metadata: data.metadata || {}
            });
            
            return {
                success: true,
                data: response.data.data,
                message: response.data.message
            };
            
        } catch (error) {
            console.error('Korapay Recipient Error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Recipient creation failed'
            };
        }
    }

    // Initiate transfer
    async initiateTransfer(data) {
        try {
            const response = await this.client.post('/transfers', {
                source: "balance",
                amount: parseFloat(data.amount),
                currency: "NGN",
                reference: data.reference,
                recipient: data.recipientCode,
                reason: data.reason || "Withdrawal payment"
            });
            
            return {
                success: true,
                data: response.data.data,
                message: response.data.message
            };
            
        } catch (error) {
            console.error('Korapay Transfer Error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Transfer initiation failed'
            };
        }
    }

    // Verify webhook signature
    verifyWebhookSignature(payload, signature, secret) {
        // In production, implement proper webhook signature verification
        // This is a placeholder implementation
        return true;
    }
}

module.exports = KorapayClient;