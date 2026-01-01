require('dotenv').config();
const { pool } = require('../utils/database');
const bcrypt = require('bcrypt');

async function initializeDatabase() {
    try {
        console.log('🔄 Initializing NULEX database...');
        
        // Create tables
        await pool.query(`
            -- Enable UUID extension
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
            
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_id UUID DEFAULT uuid_generate_v4() UNIQUE,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                phone VARCHAR(20) NOT NULL,
                password_hash TEXT NOT NULL,
                referrer_id INTEGER REFERENCES users(id),
                package_type VARCHAR(20) DEFAULT 'none' CHECK (package_type IN ('none', 'knight', 'elite')),
                task_balance DECIMAL(12,2) DEFAULT 0,
                affiliate_balance DECIMAL(12,2) DEFAULT 0,
                welcome_bonus_claimed BOOLEAN DEFAULT FALSE,
                is_admin BOOLEAN DEFAULT FALSE,
                is_blocked BOOLEAN DEFAULT FALSE,
                is_verified BOOLEAN DEFAULT FALSE,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Packages table
            CREATE TABLE IF NOT EXISTS packages (
                id SERIAL PRIMARY KEY,
                package_id UUID DEFAULT uuid_generate_v4() UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                package_type VARCHAR(20) NOT NULL CHECK (package_type IN ('knight', 'elite')),
                amount DECIMAL(12,2) NOT NULL,
                payment_method VARCHAR(50),
                payment_reference VARCHAR(100) UNIQUE,
                payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'success', 'failed')),
                korapay_reference VARCHAR(100),
                transaction_id VARCHAR(100),
                verified_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Referrals table
            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_id INTEGER NOT NULL REFERENCES users(id),
                referred_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
                package_type VARCHAR(20),
                commission_amount DECIMAL(12,2),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
                paid_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(referrer_id, referred_id)
            );

            -- Transactions table
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                transaction_id UUID DEFAULT uuid_generate_v4() UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                type VARCHAR(50) NOT NULL CHECK (type IN ('task_earning', 'referral', 'withdrawal', 'package_purchase', 'welcome_bonus')),
                amount DECIMAL(12,2) NOT NULL,
                balance_type VARCHAR(20) CHECK (balance_type IN ('task', 'affiliate')),
                description TEXT,
                reference VARCHAR(100),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Withdrawals table
            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                withdrawal_id UUID DEFAULT uuid_generate_v4() UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                amount DECIMAL(12,2) NOT NULL,
                balance_type VARCHAR(20) NOT NULL CHECK (balance_type IN ('task', 'affiliate')),
                bank_name VARCHAR(100),
                account_number VARCHAR(20),
                account_name VARCHAR(100),
                korapay_recipient_code VARCHAR(100),
                korapay_transfer_code VARCHAR(100),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'approved', 'rejected', 'paid')),
                admin_notes TEXT,
                processed_by INTEGER REFERENCES users(id),
                processed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Tasks table
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                task_id UUID DEFAULT uuid_generate_v4() UNIQUE,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                reward DECIMAL(12,2) NOT NULL,
                task_type VARCHAR(50) NOT NULL,
                duration_minutes INTEGER,
                url TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                max_completions INTEGER,
                current_completions INTEGER DEFAULT 0,
                requires_screenshot BOOLEAN DEFAULT FALSE,
                requires_question BOOLEAN DEFAULT FALSE,
                verification_question TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- User tasks table
            CREATE TABLE IF NOT EXISTS user_tasks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                task_id INTEGER NOT NULL REFERENCES tasks(id),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'approved', 'rejected')),
                screenshot_url TEXT,
                answer TEXT,
                submitted_at TIMESTAMP,
                approved_at TIMESTAMP,
                approved_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, task_id)
            );

            -- Admin logs table
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER NOT NULL REFERENCES users(id),
                action VARCHAR(100) NOT NULL,
                table_name VARCHAR(50),
                record_id INTEGER,
                old_values JSONB,
                new_values JSONB,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- System settings table
            CREATE TABLE IF NOT EXISTS system_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(100) UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Withdrawal portal table
            CREATE TABLE IF NOT EXISTS withdrawal_portal (
                id SERIAL PRIMARY KEY,
                is_open BOOLEAN DEFAULT FALSE,
                open_until TIMESTAMP,
                notes TEXT,
                updated_by INTEGER REFERENCES users(id),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Database tables created successfully');

        // Insert default admin user
        const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        
        const adminResult = await pool.query(`
            INSERT INTO users (username, email, phone, password_hash, is_admin, is_verified, package_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, username
        `, [
            process.env.ADMIN_USERNAME || 'admin',
            process.env.ADMIN_EMAIL || 'admin@nulex.com',
            process.env.ADMIN_PHONE || '08000000000',
            hashedPassword,
            true,
            true,
            'elite'
        ]);

        console.log(`✅ Admin user created/updated: ${adminResult.rows[0].username}`);

        // Insert default system settings
        const defaultSettings = [
            ['knight_package_price', '4500', 'Price for Knight package'],
            ['elite_package_price', '7500', 'Price for Elite package'],
            ['welcome_bonus_amount', '1000', 'Welcome bonus amount'],
            ['knight_referral_commission', '1500', 'Commission for Knight package referrals'],
            ['elite_referral_commission', '3500', 'Commission for Elite package referrals'],
            ['affiliate_min_withdrawal', '1000', 'Minimum withdrawal for affiliate balance'],
            ['task_min_withdrawal', '15000', 'Minimum withdrawal for task balance'],
            ['withdrawal_processing_fee', '1.5', 'Withdrawal processing fee percentage'],
            ['withdrawal_portal_open', 'false', 'Is withdrawal portal open?'],
            ['registration_enabled', 'true', 'Is user registration enabled?'],
            ['task_system_enabled', 'true', 'Is task system enabled?']
        ];

        for (const [key, value, description] of defaultSettings) {
            await pool.query(`
                INSERT INTO system_settings (setting_key, setting_value, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (setting_key) DO UPDATE SET
                    setting_value = EXCLUDED.setting_value,
                    description = EXCLUDED.description,
                    updated_at = CURRENT_TIMESTAMP
            `, [key, value, description]);
        }

        console.log('✅ Default system settings inserted');

        // Initialize withdrawal portal
        await pool.query(`
            INSERT INTO withdrawal_portal (is_open, open_until, notes)
            VALUES (false, NULL, 'Portal initialized')
            ON CONFLICT (id) DO NOTHING
        `);

        console.log('✅ Withdrawal portal initialized');

        // Insert sample tasks for testing
        const sampleTasks = [
            {
                title: 'Watch Product Review Video',
                description: 'Watch this 3-minute product review video and answer a simple question about it.',
                reward: 500,
                task_type: 'video',
                duration_minutes: 3,
                url: 'https://example.com/video1',
                max_completions: 1000,
                requires_screenshot: false,
                requires_question: true,
                verification_question: 'What was the main product feature mentioned?'
            },
            {
                title: 'Install Mobile App',
                description: 'Install our mobile app from Play Store, use it for 5 minutes, and submit screenshot.',
                reward: 1200,
                task_type: 'app',
                duration_minutes: 10,
                url: 'https://play.google.com/store/apps/details?id=com.example.app',
                max_completions: 500,
                requires_screenshot: true,
                requires_question: false
            },
            {
                title: 'Complete Shopping Survey',
                description: 'Answer 15 questions about your online shopping habits for market research.',
                reward: 800,
                task_type: 'survey',
                duration_minutes: 7,
                url: 'https://example.com/survey1',
                max_completions: 2000,
                requires_screenshot: false,
                requires_question: false
            }
        ];

        for (const task of sampleTasks) {
            await pool.query(`
                INSERT INTO tasks (title, description, reward, task_type, duration_minutes, url, max_completions, requires_screenshot, requires_question, verification_question, created_by)
                SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, id
                FROM users WHERE username = $11
                ON CONFLICT DO NOTHING
            `, [
                task.title, task.description, task.reward, task.task_type, 
                task.duration_minutes, task.url, task.max_completions,
                task.requires_screenshot, task.requires_question, 
                task.verification_question || null,
                process.env.ADMIN_USERNAME || 'admin'
            ]);
        }

        console.log('✅ Sample tasks inserted');

        console.log('🎉 Database initialization completed successfully!');
        console.log('\n🔑 Default Admin Credentials:');
        console.log(`   Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
        console.log(`   Password: ${adminPassword}`);
        console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@nulex.com'}`);
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run initialization
if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };