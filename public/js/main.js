// NULEX - Main JavaScript File

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
}

// Format Currency (Naira)
function formatCurrency(amount) {
    return '₦' + amount.toLocaleString('en-NG');
}

// Display Alert Message
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    // Insert at top of container
    const container = document.querySelector('.container') || document.body;
    container.insertBefore(alertDiv, container.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Copy to Clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('Copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// API Request Helper
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    
    if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`/api${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Request failed');
        }
        
        return result;
    } catch (error) {
        console.error('API Request Error:', error);
        showAlert(error.message, 'danger');
        throw error;
    }
}

// Check Authentication Status
function checkAuth() {
    // This will be implemented with actual session checking
    const token = localStorage.getItem('nulex_token');
    return !!token;
}

// Redirect if not authenticated
function requireAuth() {
    if (!checkAuth()) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

// Logout Function
function logout() {
    localStorage.removeItem('nulex_token');
    localStorage.removeItem('nulex_user');
    window.location.href = '/login';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Add any page-specific initialization here
    console.log('NULEX Platform Loaded');
});