// NULEX - Main JavaScript File
// Global configuration
const API_BASE_URL = window.location.origin + '/api';

// Form Validation Functions
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    // Nigerian phone format: 080, 081, 070, 090, etc.
    const re = /^[0]\d{10}$/;
    return re.test(phone);
}

function validatePassword(password) {
    // At least 8 characters, one uppercase, one lowercase, one number
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return re.test(password);
}

// Show/Hide Password
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    
    // Toggle eye icon
    const icon = input.parentNode.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    }
}

// Format Currency (Naira)
function formatCurrency(amount) {
    return '₦' + parseFloat(amount).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Display Alert Message
function showAlert(message, type = 'info', duration = 5000) {
    // Remove any existing alerts
    const existingAlerts = document.querySelectorAll('.global-alert');
    existingAlerts.forEach(alert => alert.remove());
    
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `global-alert alert alert-${type}`;
    alertDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">
                &times;
            </button>
        </div>
    `;
    
    // Style the alert
    Object.assign(alertDiv.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '9999',
        minWidth: '300px',
        maxWidth: '400px',
        animation: 'slideIn 0.3s ease-out'
    });
    
    // Add CSS animation
    if (!document.querySelector('#alert-animation')) {
        const style = document.createElement('style');
        style.id = 'alert-animation';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(alertDiv);
    
    // Remove after duration
    if (duration > 0) {
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => alertDiv.remove(), 300);
            }
        }, duration);
    }
    
    return alertDiv;
}

// Copy to Clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('Copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showAlert('Failed to copy', 'danger');
    });
}

// API Request Helper
async function apiRequest(endpoint, method = 'GET', data = null, requiresAuth = true) {
    const token = localStorage.getItem('nulex_token');
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    
    if (requiresAuth && token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        
        // Handle 401 Unauthorized
        if (response.status === 401 && requiresAuth) {
            localStorage.removeItem('nulex_token');
            localStorage.removeItem('nulex_user');
            window.location.href = '/login';
            throw new Error('Session expired. Please login again.');
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || result.message || 'Request failed');
        }
        
        return result;
    } catch (error) {
        console.error('API Request Error:', error);
        
        // Don't show alert for auth redirects
        if (!error.message.includes('Session expired')) {
            showAlert(error.message, 'danger');
        }
        
        throw error;
    }
}

// Check Authentication Status
function checkAuth() {
    const token = localStorage.getItem('nulex_token');
    const user = localStorage.getItem('nulex_user');
    
    if (!token || !user) {
        return false;
    }
    
    try {
        const userData = JSON.parse(user);
        return {
            token,
            user: userData,
            isAuthenticated: true,
            isAdmin: userData.isAdmin || false,
            hasPackage: userData.hasPackage || false
        };
    } catch (error) {
        return false;
    }
}

// Redirect if not authenticated
function requireAuth(redirectTo = '/login') {
    const auth = checkAuth();
    if (!auth) {
        window.location.href = redirectTo;
        return null;
    }
    return auth;
}

// Require package purchase
function requirePackage(redirectTo = '/blocked-dashboard') {
    const auth = requireAuth();
    if (auth && !auth.hasPackage) {
        window.location.href = redirectTo;
        return null;
    }
    return auth;
}

// Logout Function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('nulex_token');
        localStorage.removeItem('nulex_user');
        window.location.href = '/login';
    }
}

// Load User Data
async function loadUserData() {
    try {
        const auth = checkAuth();
        if (!auth) return null;
        
        const response = await apiRequest('/auth/profile', 'GET', null, true);
        if (response.success) {
            // Update localStorage with fresh data
            localStorage.setItem('nulex_user', JSON.stringify(response.user));
            return response.user;
        }
        return null;
    } catch (error) {
        console.error('Failed to load user data:', error);
        return null;
    }
}

// Update UI with user data
function updateUserUI(userData) {
    // Update welcome messages
    const welcomeElements = document.querySelectorAll('#userWelcome, .user-welcome');
    welcomeElements.forEach(el => {
        if (el && userData.username) {
            el.textContent = `Welcome, ${userData.username}`;
        }
    });
    
    // Update package display
    const packageElements = document.querySelectorAll('#userPackage, .user-package');
    packageElements.forEach(el => {
        if (el && userData.package) {
            const packageName = userData.package === 'elite' ? 'Elite' : 
                               userData.package === 'knight' ? 'Knight' : 'No Package';
            el.textContent = `${packageName} Package`;
        }
    });
    
    // Update balances
    if (userData.balances) {
        const affiliateBalanceEl = document.getElementById('affiliateBalance');
        const taskBalanceEl = document.getElementById('taskBalance');
        
        if (affiliateBalanceEl) {
            affiliateBalanceEl.textContent = formatCurrency(userData.balances.affiliate || 0);
        }
        
        if (taskBalanceEl) {
            taskBalanceEl.textContent = formatCurrency(userData.balances.task || 0);
        }
    }
}

// Load Dashboard Data
async function loadDashboardData() {
    try {
        const response = await apiRequest('/users/dashboard', 'GET');
        
        if (response.success) {
            const data = response.data;
            
            // Update balances
            if (data.user.balances) {
                const affiliateBalanceEl = document.getElementById('affiliateBalance');
                const taskBalanceEl = document.getElementById('taskBalance');
                
                if (affiliateBalanceEl) {
                    affiliateBalanceEl.textContent = formatCurrency(data.user.balances.affiliate);
                }
                
                if (taskBalanceEl) {
                    taskBalanceEl.textContent = formatCurrency(data.user.balances.task);
                }
                
                // Update package type
                const packageTypeEl = document.getElementById('packageType');
                if (packageTypeEl) {
                    const packageName = data.user.package === 'elite' ? 'Elite' : 
                                      data.user.package === 'knight' ? 'Knight' : 'No Package';
                    packageTypeEl.textContent = packageName;
                }
                
                // Update commission rate
                const commissionRateEl = document.getElementById('commissionRate');
                if (commissionRateEl) {
                    const rate = data.user.package === 'elite' 
                        ? '₦1,500 (Knight) / ₦3,500 (Elite)'
                        : '₦1,500 per referral';
                    commissionRateEl.textContent = rate;
                }
            }
            
            // Update stats
            if (data.stats) {
                const totalTasksEl = document.getElementById('totalTasks');
                const totalReferralsEl = document.getElementById('totalReferrals');
                const totalEarningsEl = document.getElementById('totalEarnings');
                const activeDaysEl = document.getElementById('activeDays');
                
                if (totalTasksEl) totalTasksEl.textContent = data.stats.totalTasks;
                if (totalReferralsEl) totalReferralsEl.textContent = data.stats.totalReferrals;
                if (totalEarningsEl) {
                    totalEarningsEl.textContent = formatCurrency(
                        (data.user.balances.affiliate || 0) + (data.user.balances.task || 0)
                    );
                }
                if (activeDaysEl) {
                    // Calculate days since registration
                    const user = JSON.parse(localStorage.getItem('nulex_user') || '{}');
                    if (user.createdAt) {
                        const created = new Date(user.createdAt);
                        const today = new Date();
                        const days = Math.floor((today - created) / (1000 * 60 * 60 * 24));
                        activeDaysEl.textContent = Math.max(1, days);
                    }
                }
            }
            
            // Update recent activity
            if (data.recentTransactions) {
                const recentActivityEl = document.getElementById('recentActivity');
                if (recentActivityEl) {
                    if (data.recentTransactions.length > 0) {
                        const activityHtml = data.recentTransactions.map(activity => `
                            <div style="display: flex; justify-content: space-between; align-items: center; 
                                        padding: 1rem; border-bottom: 1px solid #e5e7eb;">
                                <div>
                                    <div style="font-weight: 600;">${activity.description}</div>
                                    <small style="color: var(--gray);">${formatTimeAgo(activity.time)}</small>
                                </div>
                                <div style="font-weight: bold; color: ${activity.amount > 0 ? 'var(--success)' : 'var(--danger)'}">
                                    ${activity.amount > 0 ? '+' : ''}${formatCurrency(Math.abs(activity.amount))}
                                </div>
                            </div>
                        `).join('');
                        recentActivityEl.innerHTML = activityHtml;
                    } else {
                        recentActivityEl.innerHTML = `
                            <div style="text-align: center; padding: 3rem 0; color: var(--gray);">
                                <i class="fas fa-clock fa-2x" style="margin-bottom: 1rem;"></i>
                                <p>No recent activity found</p>
                            </div>
                        `;
                    }
                }
            }
            
            return data;
        }
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        showAlert('Failed to load dashboard data', 'danger');
    }
}

// Format time ago
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
    
    return date.toLocaleDateString();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication on protected pages
    const protectedPages = ['/dashboard', '/tasks', '/withdraw', '/admin', '/blocked-dashboard'];
    const currentPath = window.location.pathname;
    
    if (protectedPages.includes(currentPath)) {
        const auth = requireAuth();
        if (auth) {
            // Update UI with user data
            updateUserUI(auth.user);
            
            // Load page-specific data
            if (currentPath === '/dashboard') {
                loadDashboardData();
            }
            
            // Check admin access for admin page
            if (currentPath === '/admin' && !auth.isAdmin) {
                window.location.href = '/dashboard';
                return;
            }
            
            // Check package for dashboard/tasks/withdraw
            if (['/dashboard', '/tasks', '/withdraw'].includes(currentPath) && !auth.hasPackage) {
                window.location.href = '/blocked-dashboard';
                return;
            }
        }
    }
    
    // Initialize forms
    initializeForms();
    
    // Initialize tooltips
    initializeTooltips();
    
    // Add logout handler to all logout buttons
    document.querySelectorAll('[onclick*="logout"], .logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });
    
    console.log('NULEX Platform Initialized');
});

// Initialize Forms
function initializeForms() {
    // Registration form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegistration);
        
        // Real-time password validation
        const passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.addEventListener('input', function() {
                validatePasswordRealTime(this.value);
            });
        }
    }
    
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Withdrawal form
    const withdrawalForm = document.getElementById('withdrawalRequestForm');
    if (withdrawalForm) {
        withdrawalForm.addEventListener('submit', handleWithdrawal);
    }
    
    // Add task form (admin)
    const addTaskForm = document.getElementById('addTaskForm');
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', handleAddTask);
    }
}

// Handle Registration
async function handleRegistration(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Get form data
    const formData = {
        username: document.getElementById('username').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        password: document.getElementById('password').value,
        referrer: document.getElementById('referrer')?.value.trim() || null
    };
    
    // Validation
    if (!validateEmail(formData.email)) {
        showAlert('Please enter a valid email address', 'danger');
        return;
    }
    
    if (!validatePhone(formData.phone)) {
        showAlert('Please enter a valid Nigerian phone number (11 digits starting with 0)', 'danger');
        return;
    }
    
    if (!validatePassword(formData.password)) {
        showAlert('Password must be at least 8 characters with uppercase, lowercase, and number', 'danger');
        return;
    }
    
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (formData.password !== confirmPassword) {
        showAlert('Passwords do not match', 'danger');
        return;
    }
    
    const terms = document.getElementById('terms');
    if (terms && !terms.checked) {
        showAlert('You must agree to the Terms of Service', 'danger');
        return;
    }
    
    // Show loading
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
    submitBtn.disabled = true;
    
    try {
        const response = await apiRequest('/auth/register', 'POST', formData, false);
        
        if (response.success) {
            showAlert('Account created successfully! Redirecting to login...', 'success');
            
            // Redirect to login after delay
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        }
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Handle Login
async function handleLogin(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Get form data
    const formData = {
        username: document.getElementById('loginUsername').value.trim(),
        password: document.getElementById('loginPassword').value
    };
    
    if (!formData.username || !formData.password) {
        showAlert('Please fill in all fields', 'danger');
        return;
    }
    
    // Show loading
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    submitBtn.disabled = true;
    
    try {
        const response = await apiRequest('/auth/login', 'POST', formData, false);
        
        if (response.success) {
            // Store token and user data
            localStorage.setItem('nulex_token', response.token);
            localStorage.setItem('nulex_user', JSON.stringify(response.user));
            
            showAlert('Login successful! Redirecting...', 'success');
            
            // Redirect based on user status
            setTimeout(() => {
                if (!response.user.hasPackage) {
                    window.location.href = '/blocked-dashboard';
                } else if (response.user.isAdmin) {
                    window.location.href = '/admin';
                } else {
                    window.location.href = '/dashboard';
                }
            }, 1500);
        }
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Handle Withdrawal
async function handleWithdrawal(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Get form data
    const formData = {
        amount: parseFloat(document.getElementById('withdrawAmount').value),
        balanceType: document.querySelector('.balance-card.selected')?.dataset.type,
        bankName: document.getElementById('bankName')?.value.trim(),
        accountNumber: document.getElementById('accountNumber')?.value.trim(),
        accountName: document.getElementById('accountName')?.value.trim()
    };
    
    // Validation
    if (!formData.balanceType) {
        showAlert('Please select a balance type', 'danger');
        return;
    }
    
    if (!formData.amount || formData.amount <= 0) {
        showAlert('Please enter a valid amount', 'danger');
        return;
    }
    
    if (!formData.bankName || !formData.accountNumber || !formData.accountName) {
        showAlert('Please complete all bank details', 'danger');
        return;
    }
    
    if (!/^\d{10}$/.test(formData.accountNumber)) {
        showAlert('Account number must be 10 digits', 'danger');
        return;
    }
    
    const terms = document.getElementById('agreeTerms');
    if (terms && !terms.checked) {
        showAlert('You must agree to the terms and conditions', 'danger');
        return;
    }
    
    // Show loading
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    submitBtn.disabled = true;
    
    try {
        const response = await apiRequest('/withdrawals', 'POST', formData);
        
        if (response.success) {
            showAlert('Withdrawal request submitted successfully!', 'success');
            
            // Reset form
            form.reset();
            
            // Update UI
            const auth = checkAuth();
            if (auth && auth.user) {
                // Deduct amount from local balance
                if (formData.balanceType === 'affiliate') {
                    auth.user.balances.affiliate -= formData.amount;
                } else {
                    auth.user.balances.task -= formData.amount;
                }
                localStorage.setItem('nulex_user', JSON.stringify(auth.user));
                updateUserUI(auth.user);
            }
            
            // Reload withdrawal history if on withdraw page
            if (typeof loadWithdrawalHistory === 'function') {
                loadWithdrawalHistory();
            }
        }
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Handle Add Task (Admin)
async function handleAddTask(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Get form data
    const formData = {
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim(),
        reward: parseFloat(document.getElementById('taskReward').value),
        taskType: document.getElementById('taskType').value,
        durationMinutes: parseInt(document.getElementById('taskDuration').value) || null,
        url: document.getElementById('taskUrl')?.value.trim() || null,
        maxCompletions: parseInt(document.getElementById('taskMaxCompletions').value) || 1000,
        requiresScreenshot: document.getElementById('requiresScreenshot')?.checked || false,
        requiresQuestion: document.getElementById('requiresQuestion')?.checked || false,
        verificationQuestion: document.getElementById('taskQuestion')?.value.trim() || null
    };
    
    // Validation
    if (!formData.title || !formData.description || !formData.reward || !formData.taskType) {
        showAlert('Please fill in all required fields', 'danger');
        return;
    }
    
    if (formData.reward < 100) {
        showAlert('Reward must be at least ₦100', 'danger');
        return;
    }
    
    // Show loading
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    submitBtn.disabled = true;
    
    try {
        const response = await apiRequest('/admin/tasks', 'POST', formData);
        
        if (response.success) {
            showAlert('Task created successfully!', 'success');
            
            // Reset form
            form.reset();
            
            // Close modal if exists
            const modal = document.getElementById('addTaskModal');
            if (modal) {
                modal.style.display = 'none';
            }
            
            // Reload tasks if on tasks page
            if (typeof loadTasks === 'function') {
                loadTasks();
            }
        }
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Real-time password validation
function validatePasswordRealTime(password) {
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password)
    };
    
    const container = document.getElementById('password').parentNode;
    let requirementsEl = container.querySelector('.password-requirements');
    
    if (!requirementsEl) {
        requirementsEl = document.createElement('div');
        requirementsEl.className = 'password-requirements';
        container.appendChild(requirementsEl);
    }
    
    requirementsEl.innerHTML = `
        <small style="display: block; margin-top: 5px; color: var(--gray);">
            <span style="color: ${requirements.length ? 'var(--success)' : 'var(--danger)'}">
                ${requirements.length ? '✓' : '✗'} At least 8 characters
            </span><br>
            <span style="color: ${requirements.uppercase ? 'var(--success)' : 'var(--danger)'}">
                ${requirements.uppercase ? '✓' : '✗'} One uppercase letter
            </span><br>
            <span style="color: ${requirements.lowercase ? 'var(--success)' : 'var(--danger)'}">
                ${requirements.lowercase ? '✓' : '✗'} One lowercase letter
            </span><br>
            <span style="color: ${requirements.number ? 'var(--success)' : 'var(--danger)'}">
                ${requirements.number ? '✓' : '✗'} One number
            </span>
        </small>
    `;
}

// Initialize tooltips
function initializeTooltips() {
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(element => {
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    });
}

function showTooltip(e) {
    const tooltipText = e.target.getAttribute('data-tooltip');
    if (!tooltipText) return;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = tooltipText;
    
    Object.assign(tooltip.style, {
        position: 'absolute',
        background: 'var(--dark-blue)',
        color: 'white',
        padding: '0.5rem 0.75rem',
        borderRadius: '4px',
        fontSize: '0.875rem',
        zIndex: '10000',
        maxWidth: '200px',
        whiteSpace: 'nowrap'
    });
    
    document.body.appendChild(tooltip);
    
    const rect = e.target.getBoundingClientRect();
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
    tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
    
    e.target._tooltip = tooltip;
}

function hideTooltip(e) {
    if (e.target._tooltip) {
        e.target._tooltip.remove();
        delete e.target._tooltip;
    }
}

// Export functions for use in HTML files
window.validateEmail = validateEmail;
window.validatePhone = validatePhone;
window.validatePassword = validatePassword;
window.togglePassword = togglePassword;
window.formatCurrency = formatCurrency;
window.showAlert = showAlert;
window.copyToClipboard = copyToClipboard;
window.apiRequest = apiRequest;
window.checkAuth = checkAuth;
window.requireAuth = requireAuth;
window.requirePackage = requirePackage;
window.logout = logout;
window.loadUserData = loadUserData;
window.updateUserUI = updateUserUI;
window.loadDashboardData = loadDashboardData;
window.formatTimeAgo = formatTimeAgo;

// Make sure functions are available globally
if (typeof handleRegistration === 'function') {
    window.handleRegistration = handleRegistration;
}
if (typeof handleLogin === 'function') {
    window.handleLogin = handleLogin;
}
if (typeof handleWithdrawal === 'function') {
    window.handleWithdrawal = handleWithdrawal;
}
if (typeof handleAddTask === 'function') {
    window.handleAddTask = handleAddTask;
}

console.log('NULEX Main.js loaded successfully');