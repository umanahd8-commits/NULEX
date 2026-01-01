const jwt = require('jsonwebtoken');
const User = require('../models/User');

class AuthController {
    // Register new user
    static async register(req, res) {
        try {
            const { username, email, phone, password, referrer } = req.body;
            
            // Validate required fields
            if (!username || !email || !phone || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'All fields are required'
                });
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid email format'
                });
            }
            
            // Validate Nigerian phone number
            const phoneRegex = /^[0]\d{10}$/;
            if (!phoneRegex.test(phone)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Nigerian phone number (11 digits starting with 0)'
                });
            }
            
            // Validate password strength
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters with uppercase, lowercase, and number'
                });
            }
            
            // Check registration system setting
            // Note: In production, you'd check system_settings table
            
            // Create user
            const result = await User.create({
                username,
                email,
                phone,
                password,
                referrer
            });
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            // Generate JWT token
            const token = jwt.sign(
                { userId: result.user.id },
                process.env.JWT_SECRET || 'nulex_secret_key',
                { expiresIn: '7d' }
            );
            
            res.status(201).json({
                success: true,
                message: 'Registration successful',
                token,
                user: result.user
            });
            
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                success: false,
                error: 'Registration failed. Please try again.'
            });
        }
    }
    
    // Login user
    static async login(req, res) {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Username and password are required'
                });
            }
            
            // Find user by credentials
            const result = await User.findByCredentials(username, password);
            
            if (!result.success) {
                return res.status(401).json(result);
            }
            
            // Generate JWT token
            const token = jwt.sign(
                { userId: result.user.id },
                process.env.JWT_SECRET || 'nulex_secret_key',
                { expiresIn: '7d' }
            );
            
            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: result.user
            });
            
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                error: 'Login failed. Please try again.'
            });
        }
    }
    
    // Get current user profile
    static async getProfile(req, res) {
        try {
            res.json({
                success: true,
                user: req.user
            });
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get profile'
            });
        }
    }
    
    // Update user profile
    static async updateProfile(req, res) {
        try {
            const updates = {};
            const allowedUpdates = ['phone'];
            
            // Filter allowed updates
            Object.keys(req.body).forEach(key => {
                if (allowedUpdates.includes(key)) {
                    updates[key] = req.body[key];
                }
            });
            
            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No valid updates provided'
                });
            }
            
            // In production, update user in database
            // For now, just return success
            res.json({
                success: true,
                message: 'Profile updated successfully',
                updates
            });
            
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update profile'
            });
        }
    }
    
    // Change password
    static async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            
            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Current and new passwords are required'
                });
            }
            
            // Validate new password strength
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
            if (!passwordRegex.test(newPassword)) {
                return res.status(400).json({
                    success: false,
                    error: 'New password must be at least 8 characters with uppercase, lowercase, and number'
                });
            }
            
            // In production:
            // 1. Verify current password
            // 2. Update to new password
            // 3. Invalidate existing tokens if needed
            
            res.json({
                success: true,
                message: 'Password changed successfully'
            });
            
        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to change password'
            });
        }
    }
    
    // Logout
    static async logout(req, res) {
        try {
            // In production, you might want to:
            // 1. Add token to blacklist
            // 2. Clear session
            
            res.json({
                success: true,
                message: 'Logged out successfully'
            });
            
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }
    }
}

module.exports = AuthController;