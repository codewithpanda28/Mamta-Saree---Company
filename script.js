// ==========================================
// CONFIGURATION
// ==========================================
// !!!! IMPORTANT: CHANGE THIS TO YOUR ACTUAL N8N INSTANCE URL AND WHATSAPP TOKEN !!!!
const SHEET_ID = '1fwN4eup-90LV4n8ZuJ2okmn1lM5gzO1h7t8_aZ-0M-E';
const API_KEY = 'AIzaSyAVZw0YNSzwcWt1afw9dwNtpDfjhRvdlmo'; // <-- Apna API key yahan dalo
const N8N_BASE_URL = 'https://n8n.srv1114630.hstgr.cloud/webhook';
const WHATSAPP_API = 'https://thinkaiq.in/api/39620217-6b32-4554-80ea-51c84db06f46/contact/send-message';
const WHATSAPP_TOKEN = 'ruFA4YRHbJ0e5Sw08p4ZPLDkeYhqKUhi8GZZtSvZmYzzXXInxxR539GJ9GJQ0q9K';

const API = {
    // GET endpoints for fetching data
    products: `${N8N_BASE_URL}/mamta-saree/products`,
    orders: `${N8N_BASE_URL}/mamta-saree/orders`,
    payments: `${N8N_BASE_URL}/mamta-saree/payments`,
    customers: `${N8N_BASE_URL}/mamta-saree/customers`,
    leads: `${N8N_BASE_URL}/mamta-saree/leads`,
    conversations: `${N8N_BASE_URL}/mamta-saree/conversations`,

    // POST endpoints for CRUD operations
    addProduct: `${N8N_BASE_URL}/mamta-saree/products/add`,
    updateProduct: `${N8N_BASE_URL}/mamta-saree/products/update`,
    deleteProduct: `${N8N_BASE_URL}/mamta-saree/products/delete`,
    addCustomer: `${N8N_BASE_URL}/mamta-saree/customers/add`,
    updateCustomer: `${N8N_BASE_URL}/mamta-saree/customers/update`,
    addLead: `${N8N_BASE_URL}/mamta-saree/leads/add`,
    updateLead: `${N8N_BASE_URL}/mamta-saree/leads/update`,

    // Order specific POST endpoints
    updateOrder: `${N8N_BASE_URL}/mamta-saree/orders/update`, // Used for general order status/tracking updates
    addTracking: `${N8N_BASE_URL}/mamta-saree/orders/tracking`, // Specific for adding tracking, also sends WhatsApp
    
    // Payment specific POST endpoints
    updatePayment: `${N8N_BASE_URL}/mamta-saree/payments/update`, // For payment verification/rejection
};

const LOW_STOCK_THRESHOLD = 5; // Alert when stock goes below or equals this value

// ==========================================
// GLOBAL DATA STORE
// ==========================================
let allData = {
    products: [],
    orders: [],
    payments: [],
    customers: [],
    leads: [],
    conversations: []
};

let currentFilter = 'today'; // For Daily Report

// ==========================================
// FETCH DATA FROM GOOGLE SHEETS (DIRECT)
// ==========================================
async function fetchSheet(sheetName) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.values || data.values.length < 2) return [];

        const headers = data.values[0].map(h =>
            h.trim().replace(/\s+/g, '_')
        );

        return data.values.slice(1).map(row => {
            const obj = {};
            headers.forEach((h, i) => {
                obj[h] = row[i] || '';
            });
            return obj;
        });
    } catch (error) {
        console.error(`Error fetching ${sheetName}:`, error);
        return [];
    }
}

// ==========================================
// LOAD ALL DATA (Google Sheets Direct)
// ==========================================
async function loadAllData() {
    showLoading(true, 'Loading data...');
    
    try {
        // Fetch from Google Sheets directly
        allData.products = await fetchSheet('Products');
        allData.orders = await fetchSheet('Orders');
        allData.customers = await fetchSheet('Customers');
        allData.payments = await fetchSheet('Payments');
        
        console.log('✅ Data loaded:', allData);
        
        // Render all sections
        renderDashboard();
        renderProducts();
        renderOrders();
        renderCustomers();
        renderPayments();
        
        showToast('✅ Data loaded successfully!', 'success');
    } catch (error) {
        console.error('Load error:', error);
        showToast('❌ Error loading data: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}


// ==========================================
// CORE UTILITY FUNCTIONS (Must be defined first)
// ==========================================

// Helper to get status class for badges
function getStatusClass(status) {
    if (!status) return 'default';
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('delivered')) return 'delivered';
    if (lowerStatus.includes('shipped') || lowerStatus.includes('dispatched')) return 'shipped';
    if (lowerStatus.includes('confirmed') || lowerStatus === 'hot') return 'confirmed';
    if (lowerStatus.includes('pending') || lowerStatus.includes('processing') || lowerStatus === 'warm' || lowerStatus === 'new' || lowerStatus === 'advance') return 'pending';
    if (lowerStatus.includes('cancelled') || lowerStatus.includes('failed') || lowerStatus === 'lost') return 'cancelled';
    if (lowerStatus.includes('paid') || lowerStatus.includes('success')) return 'paid';
    if (lowerStatus.includes('refund')) return 'refunded';
    if (lowerStatus.includes('converted')) return 'success';
    return 'default';
}

// Helper to get payment status class for badges
function getPaymentStatusClass(status) {
    return getStatusClass(status);
}

// Helper to get payment type class for badges
function getPaymentTypeClass(paymentType) {
    if (!paymentType) return 'default';
    const lowerType = paymentType.toLowerCase();
    if (lowerType.includes('cod')) return 'cod';
    if (lowerType.includes('50')) return 'fifty-percent';
    if (lowerType.includes('full') || lowerType.includes('100')) return 'full-paid';
    if (lowerType.includes('advance')) return 'advance';
    return 'default';
}

// Helper to format numbers (e.g., for currency)
function formatNumber(numStr) {
    if (numStr === null || numStr === undefined || numStr === '') return '0';
    const num = parseFloat(numStr);
    return isNaN(num) ? '0' : num.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

// Helper to format timestamp for display
function formatTimestamp(dateString) {
    return formatDateTime(dateString);
}

// Robust date parsing helper
function parseDate(dateString) {
    if (!dateString) return null;

    // Try parsing as ISO 8601 first (most robust for various formats)
    let date = new Date(dateString);

    // If invalid, try other common formats
    if (isNaN(date.getTime())) {
        // Try DD-MM-YYYY or DD/MM/YYYY
        let parts = dateString.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?: (\d{1,2}):(\d{1,2}):?(\d{1,2})?)?$/);
        if (parts) {
            const day = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10) - 1; // Month is 0-indexed
            const year = parseInt(parts[3], 10);
            const hour = parseInt(parts[4] || '0', 10);
            const minute = parseInt(parts[5] || '0', 10);
            const second = parseInt(parts[6] || '0', 10);
            date = new Date(year, month, day, hour, minute, second);
        }
    }

    if (isNaN(date.getTime())) {
        // Try YYYY-MM-DD or YYYY/MM-DD
        let parts = dateString.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?: (\d{1,2}):(\d{1,2}):?(\d{1,2})?)?$/);
        if (parts) {
            const year = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10) - 1; // Month is 0-indexed
            const day = parseInt(parts[3], 10);
            const hour = parseInt(parts[4] || '0', 10);
            const minute = parseInt(parts[5] || '0', 10);
            const second = parseInt(parts[6] || '0', 10);
            date = new Date(year, month, day, hour, minute, second);
        }
    }

    // Attempt to parse string with no date separators, assuming YYYYMMDD or DDMMYYYY
    if (isNaN(date.getTime())) {
        const cleanedDateString = dateString.replace(/[^0-9]/g, '');
        if (cleanedDateString.length >= 8) {
            // Try YYYYMMDD
            let year = parseInt(cleanedDateString.substring(0, 4), 10);
            let month = parseInt(cleanedDateString.substring(4, 6), 10) - 1;
            let day = parseInt(cleanedDateString.substring(6, 8), 10);
            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                let tempDate = new Date(year, month, day);
                if (tempDate.getFullYear() === year && tempDate.getMonth() === month && tempDate.getDate() === day) {
                    date = tempDate;
                }
            }
        }
    }

    return isNaN(date.getTime()) ? null : date;
}


// Helper to format dates for display
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = parseDate(dateString);
        if (!date || isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return 'Invalid Date';
    }
}

// Helper to format time for display
function formatTime(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = parseDate(dateString);
        if (!date || isNaN(date.getTime())) return 'Invalid Time';
        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true // For AM/PM format
        });
    } catch (e) {
        console.error("Error formatting time:", dateString, e);
        return 'Invalid Time';
    }
}

// Helper to format date and time for display
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = parseDate(dateString);
        if (!date || isNaN(date.getTime())) return 'Invalid Date/Time';
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }) + ' ' + date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        console.error("Error formatting datetime:", dateString, e);
        return 'Invalid Date/Time';
    }
}

// Escapes HTML for security (XSS prevention)
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') {
        text = String(text);
    }
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (m) {
        return map[m];
    });
}

// Helper to safely get initials from name
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Helper to capitalize first letter
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Generic function to display toast messages
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.warn('Toast container not found. Message:', message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="toast-icon fas ${type === 'success' ? 'fa-check-circle' :
            type === 'error' ? 'fa-times-circle' :
                type === 'warning' ? 'fa-exclamation-triangle' :
                    'fa-info-circle'
        }"></i> ${escapeHtml(message)}`;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

// Generic function to show/hide loading spinner
function showLoading(show, message = 'Loading...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');

    if (loadingOverlay && loadingMessage) {
        loadingMessage.textContent = message;
        if (show) {
            loadingOverlay.style.display = 'flex'; // दिखाने के लिए
            loadingOverlay.style.zIndex = '9999'; // सबसे ऊपर रखें
        } else {
            loadingOverlay.style.display = 'none'; // छिपाने के लिए
            loadingOverlay.style.zIndex = '-1'; // पीछे भेज दें
        }
    }
}

// Generic function to open a modal
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling background
    }
}

// Generic function to close a modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        // Only restore scroll if no other modals are open
        if (!document.querySelector('.modal.active')) {
            document.body.style.overflow = '';
        }
    }
}

// Function to convert Google Drive direct link
// ==========================================
// CONVERT GOOGLE DRIVE LINK (UPDATED - THUMBNAIL METHOD)
// ==========================================
function convertDriveLink(url) {
    if (!url) return '';
    
    if (url.includes('drive.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) {
            // ✅ Thumbnail method - zyada reliable hai
            return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w500`;
        }
    }
    return url;
}

// Helper for product image preview in modal
function previewImage(url) {
    const preview = document.getElementById('product-image-preview');
    if (preview) {
        if (url) {
            const convertedUrl = convertDriveLink(url);
            preview.innerHTML = `<img src="${convertedUrl}" alt="Image Preview" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f0f0f0%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2250%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2212%22>Broken Link</text></svg>'">`;
        } else {
            preview.innerHTML = `<div class="no-image-placeholder small"><i class="fas fa-image"></i></div>`;
        }
    }
}

// Generic function to fetch data from n8n webhook
async function fetchFromWebhook(url) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            cache: 'no-cache' // Prevent caching issues
        });

        if (!response.ok) {
            let errorText;
            try {
                errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    errorText = errorJson.message || errorJson.error || errorText;
                } catch {
                    // Not JSON, use as is
                }
            } catch {
                errorText = `HTTP ${response.status} ${response.statusText}`;
            }
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        // Ensure consistent response format
        if (data && typeof data === 'object') {
            return data.success !== undefined ? data : { success: true, data: data };
        }
        return { success: true, data: [] };
    } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error: Please check your internet connection');
        }
        throw error;
    }
}

// Generic function to POST data to n8n webhook
async function postToWebhook(url, data) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            let errorText;
            try {
                errorText = await response.text();
                // Try to parse as JSON for better error messages
                try {
                    const errorJson = JSON.parse(errorText);
                    errorText = errorJson.message || errorJson.error || errorText;
                } catch {
                    // Not JSON, use as is
                }
            } catch {
                errorText = `HTTP ${response.status} ${response.statusText}`;
            }
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const text = await response.text();
        if (!text || text.trim() === '') {
            return { success: true };
        }
        
        try {
            return JSON.parse(text);
        } catch {
            // If not JSON, return as success with message
            return { success: true, message: text };
        }
    } catch (error) {
        console.error(`POST error for ${url}:`, error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error: Please check your internet connection');
        }
        throw error;
    }
}

// ==========================================
// CORE DATA LOADING AND REFRESH
// ==========================================
async function loadAllData(silent = false) {
    if (!silent) {
        console.log("loadAllData: Starting...");
        showLoading(true, 'Fetching latest data...');
    }

    try {
        console.log("loadAllData: Fetching endpoints...");
        const endpoints = ['products', 'orders', 'payments', 'customers', 'leads', 'conversations'];
        const fetchPromises = endpoints.map(endpoint => {
            try {
                return fetchFromWebhook(API[endpoint]);
            } catch (error) {
                console.error(`Error fetching ${endpoint}:`, error);
                return Promise.reject(error);
            }
        });

        const results = await Promise.allSettled(fetchPromises);
        console.log("loadAllData: All fetches settled.", results);

        let hasErrors = false;
        results.forEach((result, index) => {
            const key = endpoints[index];
            if (result.status === 'fulfilled' && result.value && result.value.success) {
                allData[key] = Array.isArray(result.value.data) ? result.value.data : [];
                console.log(`✓ Loaded ${key}: ${allData[key].length} records`);
            } else {
                hasErrors = true;
                const errorMsg = result.reason?.message || result.reason || 'Unknown error';
                console.warn(`⚠ Failed to load ${key}:`, errorMsg);
                if (!allData[key] || !Array.isArray(allData[key])) {
                    allData[key] = [];
                }
            }
        });

        checkLowStock();
        
        // Store last refresh time
        sessionStorage.setItem('lastDataRefresh', Date.now().toString());
        
        // Only render active tab to improve performance
        const activeTab = document.querySelector('.tab-content.active')?.id?.replace('-tab', '') || 'dashboard';
        
        // Always render dashboard and active tab
        renderDashboard();
        switch(activeTab) {
            case 'products': renderProducts(); break;
            case 'orders': renderOrders(); break;
            case 'payments': renderPayments(); break;
            case 'customers': renderCustomers(); break;
            case 'leads': renderLeads(); break;
            case 'conversations': renderConversations(); break;
            case 'daily-report': renderDailyReport(); break;
        }
        
        console.log("loadAllData: Renders complete.");

        if (!silent) {
            if (hasErrors) {
                showToast('Data loaded with some errors. Check console for details.', 'warning');
            } else {
                showToast('Data loaded successfully', 'success');
            }
        }
    } catch (err) {
        console.error('Load error:', err);
        if (!silent) {
            showToast('Error loading data: ' + (err.message || 'Unknown error'), 'error');
        }
    } finally {
        if (!silent) {
            console.log("loadAllData: Finally block executed. Hiding loading...");
            showLoading(false);
        }
    }
}

// Auto refresh data every 2 minutes
let autoRefreshInterval = null;

function startAutoRefresh() {
    // Clear existing interval if any
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(() => {
        // Only refresh if page is visible (not in background tab)
        if (!document.hidden) {
            loadAllData(true); // Silent refresh, no toast
        }
    }, 120000); // 120000 ms = 2 minutes
}

// Stop auto refresh (useful for cleanup)
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Pause auto refresh when page is hidden, resume when visible
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, could pause some operations
    } else {
        // Page is visible again, refresh data if needed
        const lastRefresh = sessionStorage.getItem('lastDataRefresh');
        const now = Date.now();
        if (!lastRefresh || (now - parseInt(lastRefresh)) > 180000) { // 3 minutes
            loadAllData(true);
        }
    }
});


// ==========================================
// RENDERING FUNCTIONS
// ==========================================

function renderDashboard() {
    renderDashboardStats();
    renderRecentOrders();
    renderTopProducts();
    renderRevenueChart();
    renderPendingActions();
}

// DASHBOARD HELPERS
function renderDashboardStats() {
    const stats = document.getElementById('dashboard-stats');
    if (!stats) return;

    // Calculate statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysOrders = allData.orders.filter(o => {
        const orderDate = parseDate(o.Order_Date);
        return orderDate && orderDate >= today && o.Status?.toLowerCase() !== 'cancelled';
    });

    const totalOrders = allData.orders.filter(o => o.Status?.toLowerCase() !== 'cancelled').length;
    const pendingOrders = allData.orders.filter(o =>
        (o.Status?.toLowerCase() === 'pending' || o.Status?.toLowerCase() === 'confirmed') && o.Status?.toLowerCase() !== 'cancelled'
    ).length;
    const shippedOrders = allData.orders.filter(o =>
        (o.Status?.toLowerCase() === 'shipped' || o.Status?.toLowerCase() === 'dispatched') && o.Status?.toLowerCase() !== 'cancelled'
    ).length;
    const deliveredOrders = allData.orders.filter(o =>
        o.Status?.toLowerCase() === 'delivered'
    ).length;

    const pendingPayments = allData.orders.filter(o =>
        (o.Payment_Status?.toLowerCase().includes('pending') || o.Payment_Status?.toLowerCase().includes('advance')) && o.Status?.toLowerCase() !== 'cancelled'
    ).length;

    const totalProducts = allData.products.length;
    const inStockProducts = allData.products.filter(p => (parseInt(p.Stock_Qty) || 0) > 0).length;
    const lowStockProducts = allData.products.filter(p => {
        const qty = parseInt(p.Stock_Qty) || 0;
        return qty > 0 && qty <= LOW_STOCK_THRESHOLD;
    }).length;

    const totalCustomers = allData.customers.length;
    const activeLeads = allData.leads.filter(l =>
        l.Status?.toLowerCase() === 'hot' || l.Status?.toLowerCase() === 'warm' || l.Status?.toLowerCase() === 'new'
    ).length;

    // Calculate revenue
    const totalRevenue = allData.orders.reduce((sum, o) => {
        if (o.Status?.toLowerCase() !== 'cancelled') {
            return sum + (parseFloat(o.Amount) || 0);
        }
        return sum;
    }, 0);

    const todaysRevenue = todaysOrders.reduce((sum, o) => {
        return sum + (parseFloat(o.Amount) || 0);
    }, 0);

    stats.innerHTML = `
        <div class="stat-card primary">
            <div class="stat-header">
                <div class="stat-icon"><i class="fas fa-rupee-sign"></i></div>
                <div class="stat-trend up"><i class="fas fa-chart-line"></i></div>
            </div>
            <div class="stat-value">₹${formatNumber(totalRevenue)}</div>
            <div class="stat-label">Total Revenue</div>
            <div class="stat-sub">Today: ₹${formatNumber(todaysRevenue)}</div>
        </div>

        <div class="stat-card success">
            <div class="stat-header">
                <div class="stat-icon"><i class="fas fa-shopping-cart"></i></div>
                <div class="stat-badge">${todaysOrders.length} today</div>
            </div>
            <div class="stat-value">${totalOrders}</div>
            <div class="stat-label">Total Orders</div>
            <div class="stat-breakdown">
                <span class="pending">${pendingOrders} pending</span>
                <span class="shipped">${shippedOrders} shipped</span>
                <span class="delivered">${deliveredOrders} delivered</span>
            </div>
        </div>

        <div class="stat-card warning">
            <div class="stat-header">
                <div class="stat-icon"><i class="fas fa-clock"></i></div>
                ${pendingPayments > 0 ? `<div class="stat-badge danger">${pendingPayments} pending</div>` : ''}
            </div>
            <div class="stat-value">${pendingPayments}</div>
            <div class="stat-label">Pending Payments</div>
        </div>

        <div class="stat-card info">
            <div class="stat-header">
                <div class="stat-icon"><i class="fas fa-box"></i></div>
                ${lowStockProducts > 0 ? `<div class="stat-badge warning">${lowStockProducts} low</div>` : ''}
            </div>
            <div class="stat-value">${totalProducts}</div>
            <div class="stat-label">Total Products</div>
            <div class="stat-sub">${inStockProducts} in stock</div>
        </div>

        <div class="stat-card purple">
            <div class="stat-header">
                <div class="stat-icon"><i class="fas fa-users"></i></div>
            </div>
            <div class="stat-value">${totalCustomers}</div>
            <div class="stat-label">Total Customers</div>
        </div>

        <div class="stat-card orange">
            <div class="stat-header">
                <div class="stat-icon"><i class="fas fa-fire"></i></div>
                ${activeLeads > 0 ? `<div class="stat-badge success">${activeLeads} active</div>` : ''}
            </div>
            <div class="stat-value">${allData.leads.length}</div>
            <div class="stat-label">Total Leads</div>
        </div>
    `;
}

function renderRecentOrders() {
    const container = document.getElementById('recent-orders');
    if (!container) return;

    const recentOrders = allData.orders
        .filter(o => o.Status?.toLowerCase() !== 'cancelled')
        .sort((a, b) => {
            const dateA = parseDate(a.Order_Date) || new Date(0);
            const dateB = parseDate(b.Order_Date) || new Date(0);
            return dateB - dateA; // Newest first
        })
        .slice(0, 5); // Display last 5 orders

    if (recentOrders.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><h3>No recent orders</h3></div>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${recentOrders.map((o) => `
                    <tr>
                        <td><strong>${escapeHtml(o.Order_ID || '-')}</strong></td>
                        <td>
                            <div class="customer-cell">
                                <span>${escapeHtml(o.Customer_Name || '-')}</span>
                                <small>${escapeHtml(o.Phone || '')}</small>
                            </div>
                        </td>
                        <td>${escapeHtml(o.Product_Name || o.Serial_No || '-')}</td>
                        <td><strong>₹${escapeHtml(o.Amount || '0')}</strong></td>
                        <td><span class="status-badge ${getStatusClass(o.Status)}">${escapeHtml(o.Status || 'Pending')}</span></td>
                        <td>
                            <button class="action-btn view" onclick="viewOrder('${escapeHtml(o.Order_ID)}')" title="Quick View">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderTopProducts() {
    const container = document.getElementById('top-products');
    if (!container) return;

    // Calculate product sales based on orders
    const productSales = {};
    allData.orders.forEach(order => {
        const serial = order.Serial_No;
        if (serial && order.Status?.toLowerCase() !== 'cancelled') {
            if (!productSales[serial]) {
                // Find full product name from allData.products if available
                const productDetail = allData.products.find(p => p.Serial_No === serial);
                productSales[serial] = {
                    serial: serial,
                    name: productDetail?.Saree_Name || order.Product_Name || serial,
                    count: 0,
                    revenue: 0
                };
            }
            productSales[serial].count += parseInt(order.Quantity || 1); // Sum quantities
            productSales[serial].revenue += parseFloat(order.Amount) || 0;
        }
    });

    const topProducts = Object.values(productSales)
        .sort((a, b) => b.count - a.count) // Sort by quantity sold
        .slice(0, 5); // Top 5

    if (topProducts.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><h3>No sales data yet</h3></div>';
        return;
    }

    container.innerHTML = `
        <div class="top-products-list">
            ${topProducts.map((p) => `
                <div class="top-product-item">
                    <div class="rank">#${topProducts.indexOf(p) + 1}</div>
                    <div class="product-info">
                        <strong>${escapeHtml(p.name)}</strong>
                        <small>${p.count} units sold • ₹${formatNumber(p.revenue)}</small>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderPendingActions() {
    const container = document.getElementById('pending-actions');
    if (!container) return;

    // Orders that are 'Pending' or 'Confirmed' but not yet 'Shipped' or 'Delivered'
    const pendingOrders = allData.orders.filter(o =>
        (o.Status?.toLowerCase() === 'pending' || o.Status?.toLowerCase() === 'confirmed') &&
        o.Status?.toLowerCase() !== 'cancelled'
    ).slice(0, 5); // Show up to 5

    // Payments that are 'Pending Verification' or partial advance
    const pendingPayments = allData.orders.filter(o =>
        (o.Payment_Status?.toLowerCase().includes('pending') || o.Payment_Status?.toLowerCase().includes('advance')) &&
        o.Status?.toLowerCase() !== 'cancelled'
    ).slice(0, 5); // Show up to 5

    let html = '<div class="pending-actions-list">';

    if (pendingOrders.length > 0) {
        html += `
            <div class="pending-section">
                <h4><i class="fas fa-shopping-cart"></i> Orders to Process (${pendingOrders.length})</h4>
                ${pendingOrders.map(o => `
                    <div class="pending-item" onclick="viewOrder('${escapeHtml(o.Order_ID)}')">
                        <span>${escapeHtml(o.Order_ID)} - ${escapeHtml(o.Customer_Name)}</span>
                        <span class="amount">₹${escapeHtml(o.Amount)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (pendingPayments.length > 0) {
        html += `
            <div class="pending-section">
                <h4><i class="fas fa-credit-card"></i> Payments to Verify (${pendingPayments.length})</h4>
                ${pendingPayments.map((o) => `
                    <div class="pending-item" onclick="viewOrder('${escapeHtml(o.Order_ID)}')">
                        <span>${escapeHtml(o.Customer_Name)} - ${escapeHtml(o.Payment_Type)}</span>
                        <span class="amount">₹${escapeHtml(o.Amount || o.Advance_Paid)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (pendingOrders.length === 0 && pendingPayments.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-check-circle"></i><h3>All caught up! No pending actions.</h3></div>';
    }

    html += '</div>';
    container.innerHTML = html;
}

function renderRevenueChart() {
    const container = document.getElementById('revenue-chart');
    if (!container) return;

    // Get last 7 days revenue
    const days = [];
    const revenues = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const dayRevenue = allData.orders.filter(o => {
            const orderDate = parseDate(o.Order_Date);
            return orderDate && orderDate >= date && orderDate < nextDate && o.Status?.toLowerCase() !== 'cancelled';
        }).reduce((sum, o) => sum + (parseFloat(o.Amount) || 0), 0);

        days.push(date.toLocaleDateString('en-IN', { weekday: 'short' }));
        revenues.push(dayRevenue);
    }

    const maxRevenue = Math.max(...revenues, 1); // Ensure max is at least 1 to avoid division by zero

    container.innerHTML = `
        <div class="chart-bars">
            ${revenues.map((rev, idx) => `
                <div class="chart-bar-container">
                    <div class="chart-bar" style="height: ${maxRevenue > 0 ? (rev / maxRevenue) * 90 : 0}%">
                        <span class="chart-value">₹${formatNumber(rev)}</span>
                    </div>
                    <span class="chart-label">${days[idx]}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// ==========================================
// PRODUCTS TAB (Card Format)
// ==========================================
function renderProducts() {
    const container = document.getElementById('products-table');
    if (!container) return;

    let products = [...allData.products];

    // Apply search filter
    const search = document.getElementById('product-search')?.value.toLowerCase() || '';
    if (search) {
        products = products.filter(p =>
            (p.Serial_No || '').toLowerCase().includes(search) ||
            (p.Saree_Name || '').toLowerCase().includes(search) ||
            (p.Product_Name || '').toLowerCase().includes(search) ||
            (p.Category || '').toLowerCase().includes(search) ||
            (p.Color || '').toLowerCase().includes(search) ||
            (p.Fabric || '').toLowerCase().includes(search)
        );
    }

    if (products.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>No products found</h3>
                <p>Add your first product to get started</p>
                <button class="btn btn-primary" onclick="openProductModal()">
                    <i class="fas fa-plus"></i> Add Product
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="products-grid">
            ${products.map((p) => {
                // ✅ FIX: Check all possible image field names
                const rawImageUrl = p.Image_URL || p.image_url || p.ImageURL || p.image || '';
                const imageUrl = convertDriveLink(rawImageUrl);
                
                // Debug log - remove after testing
                console.log('Product:', p.Serial_No, 'Raw URL:', rawImageUrl, 'Converted:', imageUrl);
                
                const stockQty = parseInt(p.Stock_Qty) || 0;
                const stockClass = stockQty === 0 ? 'out-of-stock' : stockQty <= LOW_STOCK_THRESHOLD ? 'low-stock' : 'in-stock';
                const stockLabel = stockQty === 0 ? 'Out of Stock' : stockQty <= LOW_STOCK_THRESHOLD ? 'Low Stock' : 'In Stock';

                return `
                    <div class="product-card ${stockQty === 0 ? 'disabled' : ''}">
                        <div class="product-card-image" onclick="viewProductImage('${escapeHtml(imageUrl)}', '${escapeHtml(p.Saree_Name || '')}')">
                            ${imageUrl ? 
                                `<img src="${imageUrl}" alt="${escapeHtml(p.Saree_Name || 'Product')}"
                                    onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'no-image\\'><i class=\\'fas fa-image\\'></i><br><small>Image Load Failed</small></div>'">` :
                                `<div class="no-image"><i class="fas fa-image"></i><br><small>No Image</small></div>`
                            }
                            <span class="stock-badge ${stockClass}">${stockLabel}</span>
                        </div>
                        <div class="product-card-body">
                            <div class="product-card-header">
                                <span class="serial-no">${escapeHtml(p.Serial_No || '-')}</span>
                                <span class="category-tag">${escapeHtml(p.Category || '-')}</span>
                            </div>
                            <h4 class="product-name">${escapeHtml(p.Saree_Name || p.Product_Name || 'Unnamed Product')}</h4>
                            <div class="product-meta">
                                <span class="color"><i class="fas fa-palette"></i> ${escapeHtml(p.Color || '-')}</span>
                                <span class="fabric"><i class="fas fa-layer-group"></i> ${escapeHtml(p.Fabric || '-')}</span>
                            </div>
                            <div class="product-price">₹${formatNumber(p.Price || 0)}</div>

                        </div>
                        <div class="product-card-actions">
                            <button class="btn btn-sm btn-outline" onclick="openProductModal('${escapeHtml(p.Serial_No)}')" title="Edit">
                                <i class="fas fa-edit"></i> Update
                            </button>
                            <button class="btn btn-sm btn-outline danger" onclick="deleteProduct('${escapeHtml(p.Serial_No)}')" title="Delete">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function filterProducts() {
    renderProducts(); // Re-render with current search input
}

// Quick stock update for product cards
async function quickStockUpdate(serialNo, change) {
    const product = allData.products.find(p => p.Serial_No === serialNo);
    if (!product) return;

    const currentQty = parseInt(product.Stock_Qty) || 0;
    const newQty = Math.max(0, currentQty + change);

    if (newQty === currentQty) return;

    try {
        showLoading(true, 'Updating stock...');

        let stockStatus = 'In Stock';
        if (newQty === 0) stockStatus = 'Out of Stock';
        else if (newQty <= LOW_STOCK_THRESHOLD) stockStatus = 'Low Stock';

        await postToWebhook(API.updateProduct, {
            Serial_No: serialNo,
            Stock_Qty: newQty.toString(),
            Stock_Status: stockStatus
        });

        // Update local data for immediate UI refresh
        product.Stock_Qty = newQty.toString();
        product.Stock_Status = stockStatus;

        renderProducts(); // Re-render product cards
        renderDashboard(); // Update dashboard stats
        showToast(`Stock for ${escapeHtml(product.Saree_Name || serialNo)} updated to ${newQty}.`, 'success');

        if (newQty === 0) {
            showToast(`Warning: ${escapeHtml(product.Saree_Name || serialNo)} is now out of stock!`, 'warning', 5000);
        } else if (newQty <= LOW_STOCK_THRESHOLD) {
            showToast(`Alert: ${escapeHtml(product.Saree_Name || serialNo)} is low in stock (${newQty} left).`, 'info', 5000);
        }

    } catch (error) {
        console.error('Quick stock update error:', error);
        showToast('Failed to update stock: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}


// ==========================================
// ORDERS TAB
// ==========================================
function renderOrders() {
    const container = document.getElementById('orders-table');
    if (!container) return;

    let orders = [...allData.orders];

    // Apply all filters and search terms
    orders = applyOrderFilters(orders);

    // Sort by date (newest first)
    orders.sort((a, b) => {
        const dateA = parseDate(a.Order_Date) || new Date(0);
        const dateB = parseDate(b.Order_Date) || new Date(0);
        return dateB - dateA;
    });

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-cart"></i>
                <h3>No orders found</h3>
                <p>Try adjusting your filters or search terms.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="table-info" style="margin-bottom: 10px; font-size: 0.9em; color: var(--text-light);">
            Showing ${orders.length} of ${allData.orders.length} total orders
        </div>
        <table>
            <thead>
                <tr>
                    <th>Order ID</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Product</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${orders.map((o) => `
                    <tr class="order-row ${o.Status?.toLowerCase().replace(/\s/g, '-') || 'pending'}">
                        <td><strong>${escapeHtml(o.Order_ID || '-')}</strong></td>
                        <td>${formatDate(o.Order_Date)}</td>
                        <td>
                            <div class="customer-cell">
                                <span>${escapeHtml(o.Customer_Name || '-')}</span>
                            </div>
                        </td>
                        <td>
                            <a href="tel:${escapeHtml(o.Phone)}" class="phone-link">${escapeHtml(o.Phone || '-')}</a>
                        </td>
                        <td>
                            <span title="${escapeHtml(o.Product_Name || '')}">${escapeHtml((o.Product_Name || `S.No: ${o.Serial_No}` || '-').substring(0, 25))}${o.Product_Name?.length > 25 ? '...' : ''}</span>
                        </td>
                        <td><strong>₹${escapeHtml(o.Amount || '0')}</strong></td>
                        <td>
                            <span class="status-badge ${getPaymentTypeClass(o.Payment_Type)}">
                                ${escapeHtml(o.Payment_Type || 'N/A')}
                            </span>
                        </td>
                        <td>
                            <span class="status-badge ${getStatusClass(o.Status)}">
                                ${escapeHtml(o.Status || 'Pending')}
                            </span>
                        </td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn view" onclick="viewOrder('${escapeHtml(o.Order_ID)}')" title="View Details">
                                    <i class="fas fa-eye"></i>
                                </button>
                                ${(o.Status?.toLowerCase() === 'confirmed' || o.Status?.toLowerCase() === 'pending') && !o.Tracking_ID ? `
                                    <button class="action-btn dispatch" onclick="openTrackingModal('${escapeHtml(o.Order_ID)}', '${escapeHtml(o.Phone)}', '${escapeHtml(o.Customer_Name)}')" title="Add Tracking">
                                        <i class="fas fa-shipping-fast"></i>
                                    </button>
                                ` : ''}
                                <button class="action-btn video" onclick="openVideoModal('${escapeHtml(o.Phone)}', '${escapeHtml(o.Customer_Name)}')" title="Send Packing Video">
                                    <i class="fas fa-video"></i>
                                </button>
                                <button class="action-btn whatsapp" onclick="openWhatsApp('${escapeHtml(o.Phone)}')" title="WhatsApp">
                                    <i class="fab fa-whatsapp"></i>
                                </button>
                                <div class="dropdown">
                                    <button class="action-btn menu" title="More Actions">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="dropdown-content">
                                        <a href="#" onclick="event.preventDefault(); sendWhatsappMessageForOrder('${escapeHtml(o.Order_ID)}', 'confirmation')"><i class="fab fa-whatsapp"></i> Send Conf. Msg</a>
                                        ${o.Tracking_ID ? `<a href="#" onclick="event.preventDefault(); sendWhatsappMessageForOrder('${escapeHtml(o.Order_ID)}', 'tracking')"><i class="fab fa-whatsapp"></i> Send Tracking Msg</a>` : ''}
                                        <div class="dropdown-divider"></div>
                                        <a href="#" onclick="event.preventDefault(); deleteOrder('${escapeHtml(o.Order_ID)}')" class="text-danger"><i class="fas fa-trash"></i> Cancel Order</a>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    setupDropdowns(); // Initialize dropdowns for the newly rendered elements
}

// Apply filters to orders array
function applyOrderFilters(orders) {
    const statusFilter = document.getElementById('order-status-filter')?.value || 'all';
    const paymentFilter = document.getElementById('order-payment-filter')?.value || 'all';
    const dateFromValue = document.getElementById('order-date-from')?.value;
    const dateToValue = document.getElementById('order-date-to')?.value;
    const searchTerm = document.getElementById('order-search')?.value.toLowerCase() || '';

    const dateFrom = dateFromValue ? parseDate(dateFromValue) : null;
    if (dateFrom) dateFrom.setHours(0, 0, 0, 0);

    const dateTo = dateToValue ? parseDate(dateToValue) : null;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    return orders.filter(order => {
        // Status filter
        if (statusFilter !== 'all') {
            if ((order.Status || '').toLowerCase() !== statusFilter.toLowerCase()) {
                return false;
            }
        }

        // Payment filter
        if (paymentFilter !== 'all') {
            const paymentType = (order.Payment_Type || '').toLowerCase();
            if (paymentFilter === '50%' && !paymentType.includes('50')) return false;
            if (paymentFilter === 'full' && !(paymentType.includes('full') || paymentType.includes('100'))) return false;
            if (paymentFilter === 'cod' && !paymentType.includes('cod')) return false;
            if (paymentFilter === 'pending' && (!paymentType.includes('pending') && !paymentType.includes('advance'))) return false;
        }

        // Date range filter
        if (dateFrom || dateTo) {
            const orderDate = parseDate(order.Order_Date);
            if (!orderDate) return false; // Orders without valid date are excluded from date filtering
            if (dateFrom && orderDate < dateFrom) return false;
            if (dateTo && orderDate > dateTo) return false;
        }

        // Search filter (Order ID, Customer Name, Phone, Product Name, Serial No, Address)
        if (searchTerm) {
            const searchableText = [
                order.Order_ID,
                order.Customer_Name,
                order.Phone,
                order.Product_Name,
                order.Serial_No,
                order.Delivery_Address
            ]
                .map(f => String(f || '').toLowerCase())
                .join(' ');

            if (!searchableText.includes(searchTerm.toLowerCase())) return false;
        }

        return true;
    });
}

// ==========================================
// PAYMENTS TAB
// ==========================================
function renderPayments() {
    const container = document.getElementById('payments-table');
    if (!container) return;

    let payments = [...allData.payments];
    const searchTerm = document.getElementById('payment-search')?.value.toLowerCase() || '';

    if (searchTerm) {
        payments = payments.filter(p =>
            (p.Payment_ID || '').toLowerCase().includes(searchTerm) ||
            (p.Order_ID || '').toLowerCase().includes(searchTerm) ||
            (p.Customer_Name || p.Name || '').toLowerCase().includes(searchTerm) ||
            (p.Payment_Type || '').toLowerCase().includes(searchTerm) ||
            (p.Status || '').toLowerCase().includes(searchTerm) ||
            (p.Phone || '').toLowerCase().includes(searchTerm)
        );
    }

    payments.sort((a, b) => {
        const dateA = parseDate(a.Payment_Date || a.Date || a.Timestamp);
        const dateB = parseDate(b.Payment_Date || b.Date || b.Timestamp);
        return dateB - dateA;
    });

    if (payments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-credit-card"></i>
                <h3>No payment records found</h3>
                <p>Payments are usually linked to orders.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="table-info" style="margin-bottom: 10px; font-size: 0.9em; color: var(--text-light);">
            Showing ${payments.length} of ${allData.payments.length} total payments
        </div>
        <table>
            <thead>
                <tr>
                    <th>Payment ID</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Payment Type</th>
                    <th>Total Amount</th>
                    <th>Advance Paid</th>
                    <th>Balance Due</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${payments.map((p, index) => {
                    const screenshotUrl = p.Screenshot_URL ? convertDriveLink(p.Screenshot_URL) : null;
                    
                    // ✅ FIX: Use correct field names from sheet
                    const totalAmount = p.Amount_Expected || p.Amount || '0';
                    const advancePaid = p.Advance_Paid || '0';
                    const balanceDue = p.Balance_Due || '0';
                    const paymentType = p.Payment_Type || 'N/A';
                    
                    // Generate Payment ID if missing
                    const paymentId = p.Payment_ID || `PAY-${index + 1}`;
                    
                    // Check if pending verification
                    const isPending = !p.Status || 
                                      p.Status.toLowerCase().includes('pending') || 
                                      p.Status.toLowerCase() === 'pending verification';
                    
                    // Determine payment type badge
                    const isHalfPayment = paymentType.toLowerCase().includes('half') || 
                                          paymentType.toLowerCase().includes('50') ||
                                          paymentType.toLowerCase().includes('cod');
                    
                    return `
                    <tr class="${isPending ? 'pending-row' : ''}">
                        <td><strong>${escapeHtml(paymentId)}</strong></td>
                        <td>${formatDate(p.Timestamp || p.Payment_Date || p.Date)}</td>
                        <td>${escapeHtml(p.Customer_Name || p.Name || '-')}</td>
                        <td>
                            ${p.Phone ? `
                                <a href="tel:${escapeHtml(p.Phone)}" class="phone-link">${escapeHtml(p.Phone)}</a>
                            ` : '-'}
                        </td>
                        <td>
                            <span class="status-badge ${isHalfPayment ? 'fifty-percent' : 'full-paid'}">
                                ${isHalfPayment ? '50% + COD' : 'Full Online'}
                            </span>
                        </td>
                        <td><strong>₹${formatNumber(totalAmount)}</strong></td>
                        <td class="text-success"><strong>₹${formatNumber(advancePaid)}</strong></td>
                        <td class="${parseFloat(balanceDue) > 0 ? 'text-danger' : ''}">
                            <strong>₹${formatNumber(balanceDue)}</strong>
                            ${parseFloat(balanceDue) > 0 ? '<br><small>(COD pe lena hai)</small>' : ''}
                        </td>
                        <td>
                            <span class="status-badge ${getStatusClass(p.Status)}">
                                ${escapeHtml(p.Status || 'Pending')}
                            </span>
                        </td>
                        <td>
                            <div class="action-btns">
                                ${isPending ? `
                                    <button class="action-btn" onclick="quickApprovePayment('${escapeHtml(p.Phone)}', '${escapeHtml(paymentId)}')" 
                                            title="Approve Payment" style="color: #28a745; border-color: #28a745;">
                                        <i class="fas fa-check"></i>
                                    </button>
                                    <button class="action-btn" onclick="quickRejectPayment('${escapeHtml(p.Phone)}', '${escapeHtml(paymentId)}')" 
                                            title="Reject Payment" style="color: #dc3545; border-color: #dc3545;">
                                        <i class="fas fa-times"></i>
                                    </button>
                                ` : ''}
                                <button class="action-btn view" onclick="viewPayment('${escapeHtml(paymentId)}')" title="View Details">
                                    <i class="fas fa-eye"></i>
                                </button>
                                ${screenshotUrl ? `
                                    <button class="action-btn" onclick="viewScreenshot('${escapeHtml(screenshotUrl)}')" 
                                            title="View Screenshot" style="color: #6f42c1; border-color: #6f42c1;">
                                        <i class="fas fa-image"></i>
                                    </button>
                                ` : ''}
                                ${p.Phone ? `
                                    <button class="action-btn whatsapp" onclick="openWhatsApp('${escapeHtml(p.Phone)}')" title="WhatsApp">
                                        <i class="fab fa-whatsapp"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// ==========================================
// QUICK APPROVE/REJECT PAYMENT FROM TABLE
// ==========================================

// ==========================================
// QUICK APPROVE/REJECT PAYMENT FROM TABLE
// ==========================================

async function quickApprovePayment(phone, paymentId) {
    console.log("DEBUG: quickApprovePayment called. Phone:", phone, "PaymentID:", paymentId); // <--- YE ADD KARO
    
    if (!confirm('✅ Payment APPROVE karna hai?\n\nCustomer ko WhatsApp message jayega aur Sheet update hogi.')) {
        console.log("DEBUG: Approval cancelled by user."); // <--- YE BHI ADD KARO
        return;
    }

    console.log("DEBUG: User confirmed approval. Starting N8N fetch..."); // <--- YE BHI ADD KARO

    try {
        showLoading(true, 'Payment approve ho raha hai...');

        // ... rest of your code ...
        
    } catch (error) {
        console.error('Approve payment error:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function quickRejectPayment(phone, paymentId) {
    const reason = prompt('Rejection reason (optional):') || 'Screenshot clear nahi tha';
    
    if (!confirm(`❌ Payment REJECT karna hai?\n\nReason: ${reason}\n\nCustomer ko WhatsApp message jayega.`)) {
        return;
    }

    try {
        showLoading(true, 'Payment reject ho raha hai...');

        // Call n8n webhook for rejection
        const response = await fetch(`${N8N_BASE_URL}/mamta-saree/payments/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                Payment_ID: paymentId,
                Phone: phone,
                Status: 'Rejected',
                Notes: reason,
                Verified_At: new Date().toISOString(),
                action: 'reject'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Reload data
        await loadAllData();
        
        showToast('❌ Payment rejected. Customer ko message bhej diya.', 'warning');
    } catch (error) {
        console.error('Reject payment error:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function quickRejectPayment(phone, paymentId) {
    const reason = prompt('Rejection reason (optional):') || 'Screenshot clear nahi tha';
    
    if (!confirm(`Payment REJECT karna hai?\nReason: ${reason}`)) {
        return;
    }

    try {
        showLoading(true, 'Payment reject ho raha hai...');

        // Update payment in sheet
        await postToWebhook(API.updatePayment || `${N8N_BASE_URL}/mamta-saree/payments/verify`, {
            Payment_ID: paymentId,
            Phone: phone,
            Status: 'Rejected',
            Notes: reason,
            Verified_At: new Date().toISOString()
        });

        // Send WhatsApp message
        const message = `❌ Payment Verify Nahi Hua\n\nReason: ${reason}\n\nKripya sahi screenshot bhejiye ya call karein:\n📞 8252472186\n\n- Mamta Saree`;
        await sendWhatsappMessage(phone, message);

        // Reload data
        await loadAllData();
        
        showToast('Payment rejected. Customer ko message bhej diya.', 'warning');
    } catch (error) {
        console.error('Reject payment error:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function filterPayments() {
    renderPayments(); // Re-render with current search input
}


// ==========================================
// CUSTOMERS TAB
// ==========================================
function renderCustomers() {
    const container = document.getElementById('customers-table');
    if (!container) return;

    let customers = [...allData.customers];
    const searchTerm = document.getElementById('customer-search')?.value.toLowerCase() || '';

    if (searchTerm) {
        customers = customers.filter(c =>
            (c.Customer_Name || c.Name || '').toLowerCase().includes(searchTerm) ||
            (c.Phone || '').toLowerCase().includes(searchTerm) ||
            (c.Email || '').toLowerCase().includes(searchTerm) ||
            (c.Address || c.Delivery_Address || '').toLowerCase().includes(searchTerm)
        );
    }

    if (customers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>No customers found</h3>
                <p>Add your first customer or they'll be added automatically with orders.</p>
                <button class="btn btn-success" onclick="openCustomerModal()"><i class="fas fa-plus"></i> Add Customer</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Customer Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Total Orders</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${customers.map((c) => {
        // Find total orders for this customer by matching phone numbers
        const customerOrders = allData.orders.filter(o =>
            (o.Phone || '').toString().replace(/[^0-9]/g, '') === (c.Phone || '').toString().replace(/[^0-9]/g, '') &&
            o.Status?.toLowerCase() !== 'cancelled'
        ).length;

        return `
                        <tr>
                            <td><strong>${escapeHtml(c.Customer_Name || c.Name || '-')}</strong></td>
                            <td><a href="tel:${escapeHtml(c.Phone || '')}" class="phone-link">${escapeHtml(c.Phone || '-')}</a></td>
                            <td>${escapeHtml(c.Email || '-')}</td>
                            <td>${escapeHtml(c.Address || c.Delivery_Address || '-')}</td>
                            <td>${customerOrders}</td>
                            <td>
                                <div class="action-btns">
                                    <button class="action-btn edit" onclick="openCustomerModal('${escapeHtml(c.Phone)}')>" title="Edit Customer">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="action-btn whatsapp" onclick="openWhatsApp('${escapeHtml(c.Phone || '')}')" title="WhatsApp">
                                        <i class="fab fa-whatsapp"></i>
                                    </button>
                                    <button class="action-btn" onclick="callCustomer('${escapeHtml(c.Phone || '')}')" title="Call Customer">
                                        <i class="fas fa-phone"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    `;
}

function filterCustomers() {
    renderCustomers(); // Re-render with current search input
}


// ==========================================
// LEADS TAB
// ==========================================
function renderLeads() {
    const container = document.getElementById('leads-table');
    if (!container) return;

    let leads = [...allData.leads];
    const searchTerm = document.getElementById('lead-search')?.value.toLowerCase() || '';

    if (searchTerm) {
        leads = leads.filter(l =>
            l.Name?.toLowerCase().includes(searchTerm) ||
            l.Phone?.toLowerCase().includes(searchTerm) ||
            l.Source?.toLowerCase().includes(searchTerm) ||
            l.Status?.toLowerCase().includes(searchTerm) ||
            l.Notes?.toLowerCase().includes(searchTerm)
        );
    }

    leads.sort((a, b) => {
        const dateA = parseDate(a.Timestamp) || new Date(0);
        const dateB = parseDate(b.Timestamp) || new Date(0);
        return dateB - dateA;
    });


    if (leads.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-fire"></i>
                <h3>No leads found</h3>
                <p>Add new leads to track potential customers.</p>
                <button class="btn btn-success" onclick="openLeadModal()"><i class="fas fa-plus"></i> Add Lead</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${leads.map((l) => `
                    <tr>
                        <td><strong>${escapeHtml(l.Name || '-')}</strong></td>
                        <td><a href="tel:${escapeHtml(l.Phone)}" class="phone-link">${escapeHtml(l.Phone || '-')}</a></td>
                        <td>${escapeHtml(l.Source || '-')}</td>
                        <td><span class="status-badge ${getStatusClass(l.Status)}">${escapeHtml(l.Status || 'New')}</span></td>
                        <td>${escapeHtml(l.Notes?.substring(0, 50) || '-')}</td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn edit" onclick="openLeadModal('${escapeHtml(l.Phone)}')" title="Edit Lead">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="action-btn whatsapp" onclick="openWhatsApp('${escapeHtml(l.Phone)}')">
                                    <i class="fab fa-whatsapp"></i>
                                </button>
                                <button class="action-btn" onclick="callCustomer('${escapeHtml(l.Phone)}')">
                                    <i class="fas fa-phone"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function filterLeads() {
    renderLeads(); // Re-render with current search input
}

// ==========================================
// CONVERSATIONS TAB (Redesigned)
// ==========================================
function renderConversations() {
    const container = document.getElementById('conversations-list');
    if (!container) return;

    let conversations = [...allData.conversations];

    // Apply search filter
    const searchTerm = document.getElementById('conversation-search')?.value.toLowerCase() || '';
    if (searchTerm) {
        conversations = conversations.filter(c =>
            (c.Sender || '').toLowerCase().includes(searchTerm) ||
            (c.Message || '').toLowerCase().includes(searchTerm) ||
            (c.Phone || '').toLowerCase().includes(searchTerm)
        );
    }

    // Apply date filters
    const dateFromValue = document.getElementById('conversation-date-from')?.value;
    const dateToValue = document.getElementById('conversation-date-to')?.value;

    if (dateFromValue || dateToValue) {
        const fromDate = dateFromValue ? parseDate(dateFromValue) : null;
        const toDate = dateToValue ? parseDate(dateToValue) : null;

        if (fromDate) fromDate.setHours(0, 0, 0, 0);
        if (toDate) toDate.setHours(23, 59, 59, 999);

        conversations = conversations.filter(c => {
            const convDate = parseDate(c.Time || c.Timestamp);
            if (!convDate) return false;

            if (fromDate && convDate < fromDate) return false;
            if (toDate && convDate > toDate) return false;
            return true;
        });
    }

    // Sort by timestamp (newest first)
    conversations.sort((a, b) => {
        const dateA = parseDate(a.Time || a.Timestamp) || new Date(0);
        const dateB = parseDate(b.Time || b.Timestamp) || new Date(0);
        return dateB - dateA;
    });

    if (conversations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <h3>No conversations found</h3>
                <p>Conversations will appear here when you communicate with customers</p>
            </div>
        `;
        return;
    }

    // Group by date
    const groupedByDate = {};
    conversations.forEach(c => {
        const date = parseDate(c.Time || c.Timestamp);
        const dateKey = date ? date.toDateString() : 'Unknown Date';
        if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
        groupedByDate[dateKey].push(c);
    });

    let html = '<div class="conversations-container">';

    Object.keys(groupedByDate).forEach(dateKey => {
        const dateConvs = groupedByDate[dateKey];
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        let displayDate = dateKey;

        if (dateKey === today) {
            displayDate = 'Today';
        } else if (dateKey === yesterday) {
            displayDate = 'Yesterday';
        } else {
            // Format for display: e.g., "DD Mon YYYY"
            const firstConvDate = parseDate(dateConvs[0].Time || dateConvs[0].Timestamp);
            displayDate = firstConvDate ? firstConvDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : dateKey;
        }


        html += `
            <div class="conversation-date-group">
                <div class="date-divider"><span>${displayDate}</span></div>
                <div class="conversation-messages">
                    ${dateConvs.map(c => {
            const isInbound = c.Direction?.toLowerCase() === 'inbound';
            const time = formatTime(c.Time || c.Timestamp);

            return `
                            <div class="conversation-bubble ${isInbound ? 'received' : 'sent'}">
                                <div class="bubble-header">
                                    <span class="sender-name">
                                        ${isInbound ? `<i class="fas fa-user"></i> ${escapeHtml(c.Sender || c.Phone || 'Customer')}` :
                    `<i class="fas fa-store"></i> Mamta Saree`}
                                    </span>
                                    <span class="message-time">${time}</span>
                                </div>
                                <div class="bubble-content">
                                    ${escapeHtml(c.Message || 'No message content')}
                                </div>
                                ${c.Phone ? `
                                    <div class="bubble-actions">
                                        <button class="btn-icon small" onclick="openWhatsApp('${escapeHtml(c.Phone)}')">
                                            <i class="fab fa-whatsapp"></i>
                                        </button>
                                        <button class="btn-icon small" onclick="callCustomer('${escapeHtml(c.Phone)}')">
                                            <i class="fas fa-phone"></i>
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}


// ==========================================
// DAILY REPORT TAB
// ==========================================
function renderDailyReport() {
    const container = document.getElementById('daily-report-content');
    if (!container) return;

    let startDate, endDate;
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    const getDay = (date, daysAgo) => {
        const d = new Date(date);
        d.setDate(d.getDate() - daysAgo);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    switch (currentFilter) {
        case 'today':
            startDate = now;
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'yesterday':
            startDate = getDay(now, 1);
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'this_week':
            // Adjust to Monday start of week if preferred, or use Sunday
            startDate = getDay(now, now.getDay()); // Sunday (0) to start of week
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'this_month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'last_month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
            endDate.setHours(23, 59, 59, 999);
            break;
        default: // Default to today
            startDate = now;
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
    }

    const filteredOrders = allData.orders.filter(o => {
        const orderDate = parseDate(o.Order_Date);
        return orderDate && orderDate >= startDate && orderDate <= endDate && o.Status?.toLowerCase() !== 'cancelled';
    });

    const totalSales = filteredOrders.reduce((sum, o) => sum + (parseFloat(o.Amount) || 0), 0);
    const totalOrders = filteredOrders.length;
    const confirmedOrders = filteredOrders.filter(o => o.Status?.toLowerCase() === 'confirmed').length;
    const shippedOrders = filteredOrders.filter(o => o.Status?.toLowerCase() === 'shipped').length;
    const deliveredOrders = filteredOrders.filter(o => o.Status?.toLowerCase() === 'delivered').length;
    const codOrders = filteredOrders.filter(o => o.Payment_Type?.toLowerCase().includes('cod')).length;
    const advancePaidOrders = filteredOrders.filter(o => o.Payment_Type?.toLowerCase().includes('advance') || o.Payment_Type?.toLowerCase().includes('50%')).length;
    const fullPaidOrders = filteredOrders.filter(o => o.Payment_Type?.toLowerCase().includes('full') || o.Payment_Type?.toLowerCase().includes('100%')).length;


    container.innerHTML = `
        <div class="report-section">
            <h4><i class="fas fa-rupee-sign"></i> Sales Overview</h4>
            <div class="report-summary-item">
                <span class="label">Total Revenue</span>
                <span class="value">₹${formatNumber(totalSales)}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Total Orders</span>
                <span class="value">${totalOrders}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Avg Order Value</span>
                <span class="value">₹${formatNumber(totalOrders > 0 ? totalSales / totalOrders : 0)}</span>
            </div>
        </div>

        <div class="report-section">
            <h4><i class="fas fa-chart-bar"></i> Order Status</h4>
            <div class="report-summary-item">
                <span class="label">Confirmed</span>
                <span class="value">${confirmedOrders}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Shipped</span>
                <span class="value">${shippedOrders}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Delivered</span>
                <span class="value">${deliveredOrders}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Pending</span>
                <span class="value">${filteredOrders.filter(o => o.Status?.toLowerCase() === 'pending').length}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Cancelled</span>
                <span class="value danger">${allData.orders.filter(o => {
        const orderDate = parseDate(o.Order_Date);
        return orderDate && orderDate >= startDate && orderDate <= endDate && o.Status?.toLowerCase() === 'cancelled';
    }).length}</span>
            </div>
        </div>

        <div class="report-section">
            <h4><i class="fas fa-money-bill-alt"></i> Payment Types</h4>
            <div class="report-summary-item">
                <span class="label">COD</span>
                <span class="value">${codOrders}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Advance Paid</span>
                <span class="value">${advancePaidOrders}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Full Paid</span>
                <span class="value">${fullPaidOrders}</span>
            </div>
        </div>

        <div class="report-section">
            <h4><i class="fas fa-box"></i> Product Activity</h4>
            <div class="report-summary-item">
                <span class="label">Products Sold</span>
                <span class="value">${filteredOrders.reduce((sum, o) => sum + (parseInt(o.Quantity) || 1), 0)}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">Unique Products Sold</span>
                <span class="value">${new Set(filteredOrders.map(o => o.Serial_No)).size}</span>
            </div>
            <div class="report-summary-item">
                <span class="label">New Products Added</span>
                <span class="value">${allData.products.filter(p => {
        const productDate = parseDate(p.Added_Date || p.Creation_Date); // Assuming product has an Added_Date
        return productDate && productDate >= startDate && productDate <= endDate;
    }).length}</span>
            </div>
        </div>
    `;
}

// ==========================================
// WHATSAPP INTEGRATION
// ==========================================

async function sendWhatsappMessage(phoneNumber, message, imageUrl = null) {
    if (!phoneNumber) {
        showToast('Phone number is missing for WhatsApp message.', 'error');
        return false;
    }
    if (!message && !imageUrl) {
        showToast('Cannot send empty WhatsApp message.', 'error');
        return false;
    }

    // Standardize phone number for WhatsApp API (e.g., prepend 91 for India if not present)
    let formattedPhoneNumber = phoneNumber.replace(/[^0-9]/g, ''); // Remove non-digits
    if (formattedPhoneNumber.length === 10) { // Assume 10-digit Indian number
        formattedPhoneNumber = '91' + formattedPhoneNumber;
    }

    showLoading(true, 'Sending WhatsApp message...');

    try {
        const payload = {
            receiver: formattedPhoneNumber,
            type: imageUrl ? 'media' : 'text',
            message: message,
        };
        if (imageUrl) {
            payload.mediaUrl = imageUrl;
        }

        const response = await fetch(WHATSAPP_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`WhatsApp API Error: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        console.log('WhatsApp send response:', data);
        showToast('WhatsApp message sent successfully!', 'success');
        return true;
    } catch (error) {
        console.error('WhatsApp send error:', error);
        showToast('Failed to send WhatsApp message: ' + error.message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

async function sendWhatsappMessageForOrder(orderId, messageType) {
    const order = allData.orders.find(o => o.Order_ID === orderId);
    if (!order) {
        showToast('Order not found.', 'error');
        return;
    }
    if (!order.Phone) {
        showToast('Customer phone number not available for this order.', 'error');
        return;
    }

    let message = '';
    let imageUrl = null;
    const customerName = order.Customer_Name || 'Customer';
    const productName = order.Product_Name || order.Serial_No || 'Product';
    const orderAmount = `₹${formatNumber(order.Amount || '0')}`;
    const orderStatus = order.Status || 'Pending';

    switch (messageType) {
        case 'confirmation':
            message = `Hello ${customerName},\nYour order #${orderId} for ${productName} (Amount: ${orderAmount}) has been *${orderStatus}*.\nThank you for shopping with us! 😊`;
            break;
        case 'tracking':
            if (order.Tracking_ID && order.Tracking_URL) {
                message = `Hello ${customerName},\nYour order #${orderId} is on its way! 🚚\nTracking ID: ${order.Tracking_ID}\nTrack here: ${order.Tracking_URL}\nStatus: ${order.Tracking_Status || 'Unknown'}`;
            } else {
                showToast('Tracking information not available for this order yet.', 'warning');
                return;
            }
            break;
        case 'custom':
            // You can implement a modal here to let the user type a custom message
            showToast('Custom message functionality not yet implemented.', 'info');
            return;
        default:
            showToast('Invalid message type.', 'error');
            return;
    }

    const success = await sendWhatsappMessage(order.Phone, message, imageUrl);
    if (success) {
        showToast(`WhatsApp ${messageType} message sent for order ${orderId}.`, 'success');
    }
}

// Function to open WhatsApp chat in a new tab
function openWhatsApp(phoneNumber) {
    if (!phoneNumber) {
        showToast('Phone number is missing.', 'warning');
        return;
    }
    // Ensure only digits, WhatsApp will handle country code if a valid local number is given
    const url = `https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}`;
    window.open(url, '_blank');
}

// Function to initiate a phone call
function callCustomer(phoneNumber) {
    if (!phoneNumber) {
        showToast('Phone number is missing.', 'warning');
        return;
    }
    window.location.href = `tel:${phoneNumber.replace(/[^0-9+]/g, '')}`; // Allow + for international numbers
}

// Function to open modal for sending packing video
function openVideoModal(phone, customerName) {
    if (!phone) {
        showToast('Customer phone number not available.', 'error');
        return;
    }
    document.getElementById('video-modal-phone').value = phone;
    document.getElementById('video-modal-customer-name').value = customerName;
    document.getElementById('video-url').value = ''; // Clear previous input
    document.getElementById('video-message').value = `Hello ${customerName},\nYour Mamta Saree order packing video is ready! Here's your video: `; // Default message

    openModal('video-modal');
}

async function sendPackingVideo() {
    const phone = document.getElementById('video-modal-phone').value;
    const customerName = document.getElementById('video-modal-customer-name').value;
    const videoUrl = document.getElementById('video-url').value.trim();
    const customMessage = document.getElementById('video-message').value.trim();

    if (!videoUrl) {
        showToast('Video URL is required.', 'error');
        return;
    }

    const message = customMessage || `Hello ${customerName},\nYour Mamta Saree order packing video is ready! Here's your video: ${videoUrl}`;

    const success = await sendWhatsappMessage(phone, message);

    if (success) {
        closeModal('video-modal');
        showToast('Packing video message sent successfully!', 'success');
    }
}


// ==========================================
// PRODUCT ACTIONS & MODALS
// ==========================================

// Image Viewer Modal function
function viewProductImage(imageUrl, title) {
    const viewerModal = document.getElementById('image-viewer-modal');
    const viewerImage = document.getElementById('viewer-image');

    if (viewerModal && viewerImage) {
        // Force reload image
        viewerImage.src = imageUrl + '?t=' + new Date().getTime();
        viewerImage.alt = title;
        openModal('image-viewer-modal');
    }
}

// Stock Update Modal (Used for manual update from product card "edit stock" button, not quick update)
function openStockModal(serialNo, currentQty) {
    document.getElementById('stock-serial-no').value = serialNo;
    document.getElementById('stock-current-qty').textContent = currentQty;
    document.getElementById('stock-new-qty').value = currentQty;
    document.getElementById('stock-adjustment').value = 0; // Reset adjustment

    openModal('stock-modal');
}

function adjustStock(amount) {
    const adjustmentInput = document.getElementById('stock-adjustment');
    const currentQtyText = document.getElementById('stock-current-qty').textContent;
    const currentQty = parseInt(currentQtyText) || 0;
    const currentAdjustment = parseInt(adjustmentInput.value) || 0;
    const newAdjustment = currentAdjustment + amount;

    adjustmentInput.value = newAdjustment;
    document.getElementById('stock-new-qty').value = Math.max(0, currentQty + newAdjustment);
}

async function updateStock() {
    const serialNo = document.getElementById('stock-serial-no').value;
    const newQty = parseInt(document.getElementById('stock-new-qty').value) || 0;

    if (!serialNo) {
        showToast('Product Serial No is missing.', 'error');
        return;
    }

    try {
        showLoading(true, 'Updating product stock...');

        const product = allData.products.find(p => p.Serial_No === serialNo);
        if (!product) {
            throw new Error(`Product with Serial No ${serialNo} not found.`);
        }

        // Determine stock status based on new quantity
        let stockStatus = 'In Stock';
        if (newQty === 0) {
            stockStatus = 'Out of Stock';
        } else if (newQty <= LOW_STOCK_THRESHOLD) {
            stockStatus = 'Low Stock';
        }

        const updateData = {
            Serial_No: serialNo,
            Stock_Qty: newQty.toString(),
            Stock_Status: stockStatus
        };

        await postToWebhook(API.updateProduct, updateData); // Use the general update product webhook

        // Update local data for immediate UI refresh
        product.Stock_Qty = newQty.toString();
        product.Stock_Status = stockStatus;

        closeModal('stock-modal');
        renderProducts(); // Re-render product table
        renderDashboard(); // Update dashboard stats

        showToast(`Stock for ${escapeHtml(serialNo)} updated to ${newQty} units.`, 'success');

        // Provide alert if low stock
        if (newQty <= LOW_STOCK_THRESHOLD && newQty > 0) {
            showToast(`⚠️ Low stock alert: ${escapeHtml(product.Saree_Name || serialNo)} has ${newQty} items left.`, 'warning', 5000);
        } else if (newQty === 0) {
            showToast(`❌ Out of stock: ${escapeHtml(product.Saree_Name || serialNo)}.`, 'error', 5000);
        }
    } catch (error) {
        console.error('Stock update error:', error);
        showToast('Error updating stock: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Auto-deduct stock when order is confirmed
async function deductStockForOrder(serialNo, quantity = 1) {
    const product = allData.products.find(p => p.Serial_No === serialNo);
    if (!product) {
        console.warn(`Product with Serial No ${serialNo} not found for stock deduction.`);
        return false;
    }

    const currentQty = parseInt(product.Stock_Qty) || 0;
    const newQty = Math.max(0, currentQty - quantity); // Ensure stock doesn't go below zero

    if (currentQty === newQty) { // No actual deduction needed or already 0
        return true;
    }

    try {
        // Determine new stock status
        let stockStatus = 'In Stock';
        if (newQty === 0) {
            stockStatus = 'Out of Stock';
        } else if (newQty <= LOW_STOCK_THRESHOLD) {
            stockStatus = 'Low Stock';
        }

        await postToWebhook(API.updateProduct, {
            Serial_No: serialNo,
            Stock_Qty: newQty.toString(),
            Stock_Status: stockStatus
        });

        // Update local data
        product.Stock_Qty = newQty.toString();
        product.Stock_Status = stockStatus;

        // Trigger UI re-render for products and dashboard
        renderProducts();
        renderDashboard();

        if (newQty <= LOW_STOCK_THRESHOLD && newQty > 0) {
            showToast(`⚠️ Low stock: ${escapeHtml(product.Saree_Name || serialNo)} (${newQty} left after order deduction).`, 'warning', 5000);
        } else if (newQty === 0) {
            showToast(`❌ Out of stock: ${escapeHtml(product.Saree_Name || serialNo)} after order deduction.`, 'error', 5000);
        }

        return true;
    } catch (error) {
        console.error(`Stock deduction error for ${serialNo}:`, error);
        showToast(`Failed to deduct stock for ${escapeHtml(serialNo)}: ${error.message}`, 'error', 5000);
        return false;
    }
}

// Open Product Modal for Add/Edit
function openProductModal(serialNoToEdit = null) {
    const isEdit = serialNoToEdit !== null;
    const product = isEdit ? allData.products.find(p => p.Serial_No === serialNoToEdit) : {};

    document.getElementById('product-modal-title').textContent = isEdit ? 'Edit Product' : 'Add Product';
    document.getElementById('product-edit-serial-no').value = isEdit ? serialNoToEdit : '';

    // Set form values
    document.getElementById('product-serial').value = product?.Serial_No || '';
    document.getElementById('product-serial').readOnly = isEdit; // Serial No cannot be changed in edit mode
    document.getElementById('product-name').value = product?.Saree_Name || product?.Product_Name || '';
    document.getElementById('product-category').value = product?.Category || 'Silk';
    document.getElementById('product-price').value = product?.Price || '';
    document.getElementById('product-color').value = product?.Color || '';
    document.getElementById('product-fabric').value = product?.Fabric || '';
    document.getElementById('product-stock-qty').value = product?.Stock_Qty || '10';
    document.getElementById('product-desc').value = product?.Description || '';
    document.getElementById('product-image').value = product?.Image_URL || product?.image_url || '';

    // Preview existing image
    previewImage(product?.Image_URL || product?.image_url || '');

    openModal('product-modal');
}

function editProduct(serialNo) {
    openProductModal(serialNo);
}

async function saveProduct() {
    const editSerialNo = document.getElementById('product-edit-serial-no').value;
    const isEdit = editSerialNo !== '';

    const productData = {
        Serial_No: document.getElementById('product-serial').value.trim(),
        Saree_Name: document.getElementById('product-name').value.trim(),
        Category: document.getElementById('product-category').value,
        Price: document.getElementById('product-price').value.trim(),
        Color: document.getElementById('product-color').value.trim(),
        Fabric: document.getElementById('product-fabric').value.trim(),
        Stock_Qty: document.getElementById('product-stock-qty').value.trim(),
        Description: document.getElementById('product-desc').value.trim(),
        Image_URL: document.getElementById('product-image').value.trim()
    };

    // Validation
    if (!productData.Serial_No) {
        showToast('Serial No is required', 'error');
        return;
    }
    if (!productData.Saree_Name) {
        showToast('Product name is required', 'error');
        return;
    }
    if (!productData.Price || isNaN(parseFloat(productData.Price))) {
        showToast('Valid price is required', 'error');
        return;
    }
    if (!productData.Stock_Qty || isNaN(parseInt(productData.Stock_Qty))) {
        showToast('Valid stock quantity is required', 'error');
        return;
    }

    // Set stock status based on quantity
    const qty = parseInt(productData.Stock_Qty) || 0;
    productData.Stock_Status = qty === 0 ? 'Out of Stock' : qty <= LOW_STOCK_THRESHOLD ? 'Low Stock' : 'In Stock';

    try {
        showLoading(true, `Saving product ${productData.Saree_Name}...`);

        const endpoint = isEdit ? API.updateProduct : API.addProduct;
        await postToWebhook(endpoint, productData);

        closeModal('product-modal');
        await loadAllData(); // Reload all data to refresh tables

        showToast(`Product ${productData.Saree_Name} ${isEdit ? 'updated' : 'added'} successfully!`, 'success');
    } catch (error) {
        console.error('Save product error:', error);
        showToast('Error saving product: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteProduct(serialNo) {
    const product = allData.products.find(p => p.Serial_No === serialNo);
    if (!product) {
        showToast('Product not found for deletion.', 'error');
        return;
    }

    const productName = product.Saree_Name || serialNo;

    if (!confirm(`Are you sure you want to delete "${productName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    try {
        showLoading(true, `Deleting product ${productName}...`);

        await postToWebhook(API.deleteProduct, { Serial_No: serialNo });

        await loadAllData(); // Reload all data to refresh tables
        showToast('Product deleted successfully', 'success');
    } catch (error) {
        console.error('Delete product error:', error);
        showToast('Error deleting product: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// ORDER ACTIONS & MODALS
// ==========================================

function viewOrder(orderId) {
    if (!orderId) {
        showToast('Invalid Order ID', 'error');
        return;
    }

    orderId = orderId.toString().trim();

    const order = allData.orders.find(o =>
        (o.Order_ID || '').toString().trim() === orderId
    );

    if (!order) {
        console.error("Order not found with ID:", orderId);
        showToast('Order not found. Please refresh data.', 'error');
        return;
    }

    const modalBody = document.getElementById('order-modal-body');
    const modal = document.getElementById('order-modal');

    if (!modalBody || !modal) return;

    modal.dataset.orderId = orderId; // Store order ID in modal dataset

    // Find product image
    const product = allData.products.find(p => p.Serial_No === order.Serial_No);
    const productImage = convertDriveLink(product?.Image_URL || order.Product_Image || '');


    modalBody.innerHTML = `
        <div class="order-detail-container">
            <div class="order-detail-header">
                <div class="order-id-badge">
                    <i class="fas fa-hashtag"></i> ${escapeHtml(order.Order_ID)}
                </div>
                <span class="status-badge large ${getStatusClass(order.Status)}">${escapeHtml(order.Status || 'Pending')}</span>
            </div>

            <div class="detail-grid">
                <div class="detail-section">
                    <h4><i class="fas fa-user"></i> Customer Details</h4>
                    <div class="detail-row">
                        <span class="label">Name:</span>
                        <span class="value">${escapeHtml(order.Customer_Name || '-')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Phone:</span>
                        <span class="value">
                            <a href="tel:${escapeHtml(order.Phone)}" class="phone-link">${escapeHtml(order.Phone || '-')}</a>
                            <button class="btn-icon small" onclick="openWhatsApp('${escapeHtml(order.Phone)}')">
                                <i class="fab fa-whatsapp"></i>
                            </button>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Address:</span>
                        <span class="value">${escapeHtml(order.Delivery_Address || order.Address || '-')}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h4><i class="fas fa-box"></i> Product Details</h4>
                    ${productImage ? `
                        <div class="product-image-preview" onclick="viewProductImage('${productImage}', '${escapeHtml(order.Product_Name || '')}')">
                            <img src="${productImage}" alt="Product" onerror="this.onerror=null; this.style.display='none'">
                        </div>
                    ` : ''}
                    <div class="detail-row">
                        <span class="label">Product:</span>
                        <span class="value">${escapeHtml(order.Product_Name || '-')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Serial No:</span>
                        <span class="value">${escapeHtml(order.Serial_No || '-')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Quantity:</span>
                        <span class="value">${escapeHtml(order.Quantity || '1')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Amount:</span>
                        <span class="value highlight">₹${formatNumber(order.Amount || 0)}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h4><i class="fas fa-credit-card"></i> Payment Details</h4>
                    <div class="detail-row">
                        <span class="label">Type:</span>
                        <span class="value">
                            <span class="status-badge ${getPaymentTypeClass(order.Payment_Type)}">${escapeHtml(order.Payment_Type || 'N/A')}</span>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Status:</span>
                        <span class="value">
                            <span class="status-badge ${getStatusClass(order.Payment_Status)}">${escapeHtml(order.Payment_Status || 'Pending')}</span>
                        </span>
                    </div>
                    ${order.Advance_Paid ? `
                        <div class="detail-row">
                            <span class="label">Advance:</span>
                            <span class="value">₹${formatNumber(order.Advance_Paid)}</span>
                        </div>
                    ` : ''}
                    ${order.Balance_Due ? `
                        <div class="detail-row">
                            <span class="label">Balance:</span>
                            <span class="value">₹${formatNumber(order.Balance_Due)}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="detail-section">
                    <h4><i class="fas fa-truck"></i> Tracking Details</h4>
                    ${order.Tracking_ID ? `
                        <div class="detail-row">
                            <span class="label">Tracking ID:</span>
                            <span class="value">${escapeHtml(order.Tracking_ID)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Courier:</span>
                            <span class="value">${escapeHtml(order.Tracking_Courier || '-')}</span>
                        </div>
                        ${order.Tracking_URL ? `
                            <div class="detail-row">
                                <span class="label">Track:</span>
                                <span class="value">
                                    <a href="${escapeHtml(order.Tracking_URL)}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> Track Order
                                    </a>
                                </span>
                            </div>
                        ` : ''}
                    ` : `
                        <div class="no-tracking">
                            <i class="fas fa-info-circle"></i>
                            <span>No tracking information available</span>
                            ${order.Status?.toLowerCase() !== 'delivered' && order.Status?.toLowerCase() !== 'cancelled' ? `
                                <button class="btn btn-sm btn-primary" onclick="closeModal('order-modal'); openTrackingModal('${escapeHtml(order.Order_ID)}', '${escapeHtml(order.Phone)}', '${escapeHtml(order.Customer_Name)}')">
                                    <i class="fas fa-plus"></i> Add Tracking
                                </button>
                            ` : ''}
                        </div>
                    `}
                </div>

                <div class="detail-section full-width">
                    <h4><i class="fas fa-calendar"></i> Timeline</h4>
                    <div class="order-timeline">
                        <div class="timeline-item ${order.Order_Date ? 'completed' : ''}">
                            <div class="timeline-icon"><i class="fas fa-shopping-cart"></i></div>
                            <div class="timeline-content">
                                <strong>Order Placed</strong>
                                <span>${formatDateTime(order.Order_Date)}</span>
                            </div>
                        </div>
                        <div class="timeline-item ${order.Status?.toLowerCase() === 'confirmed' || order.Status?.toLowerCase() === 'shipped' || order.Status?.toLowerCase() === 'delivered' ? 'completed' : ''}">
                            <div class="timeline-icon"><i class="fas fa-check"></i></div>
                            <div class="timeline-content">
                                <strong>Confirmed</strong>
                                <span>${order.Confirmed_Date ? formatDateTime(order.Confirmed_Date) : '-'}</span>
                            </div>
                        </div>
                        <div class="timeline-item ${order.Status?.toLowerCase() === 'shipped' || order.Status?.toLowerCase() === 'delivered' ? 'completed' : ''}">
                            <div class="timeline-icon"><i class="fas fa-shipping-fast"></i></div>
                            <div class="timeline-content">
                                <strong>Shipped</strong>
                                <span>${order.Dispatched_Date ? formatDateTime(order.Dispatched_Date) : '-'}</span>
                            </div>
                        </div>
                        <div class="timeline-item ${order.Status?.toLowerCase() === 'delivered' ? 'completed' : ''}">
                            <div class="timeline-icon"><i class="fas fa-check-double"></i></div>
                            <div class="timeline-content">
                                <strong>Delivered</strong>
                                <span>${order.Delivered_Date ? formatDateTime(order.Delivered_Date) : '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="order-update-section">
                <h4><i class="fas fa-edit"></i> Quick Update</h4>
                <div class="update-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Status</label>
                            <select id="update-order-status">
                                <option value="Pending" ${order.Status === 'Pending' ? 'selected' : ''}>Pending</option>
                                <option value="Confirmed" ${order.Status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                                <option value="Shipped" ${order.Status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                                <option value="Delivered" ${order.Status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                                <option value="Cancelled" ${order.Status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Tracking ID</label>
                            <input type="text" id="update-tracking-id" value="${escapeHtml(order.Tracking_ID || '')}" placeholder="Enter tracking ID">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tracking URL</label>
                            <input type="url" id="update-tracking-url" value="${escapeHtml(order.Tracking_URL || '')}" placeholder="https://...">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notes</label>
                        <textarea id="update-order-notes" rows="2" placeholder="Add notes...">${escapeHtml(order.Notes || '')}</textarea>
                    </div>
                    <button class="btn btn-primary btn-block" onclick="updateOrder()">Save Changes</button>
                </div>
            </div>
        </div>
    `;

    openModal('order-modal');
}

async function updateOrder() {
    const orderId = document.getElementById('order-modal').dataset.orderId;
    const newStatus = document.getElementById('update-order-status').value;
    const trackingId = document.getElementById('update-tracking-id').value;
    const trackingUrl = document.getElementById('update-tracking-url').value;
    const notes = document.getElementById('update-order-notes').value;

    const order = allData.orders.find(o => o.Order_ID === orderId);
    if (!order) {
        showToast('Order not found for update.', 'error');
        return;
    }

    const previousStatus = order.Status;

    try {
        showLoading(true, `Updating order ${orderId}...`);

        const updateData = {
            Order_ID: orderId,
            Status: newStatus,
            Tracking_ID: trackingId,
            Tracking_URL: trackingUrl,
            Notes: notes
        };

        // Add date based on status changes if not already set
        if (newStatus === 'Confirmed' && previousStatus !== 'Confirmed') {
            updateData.Confirmed_Date = new Date().toISOString().split('T')[0];
        }
        if (newStatus === 'Shipped' && previousStatus !== 'Shipped') {
            updateData.Dispatched_Date = new Date().toISOString().split('T')[0];
        }
        if (newStatus === 'Delivered' && previousStatus !== 'Delivered') {
            updateData.Delivered_Date = new Date().toISOString().split('T')[0];
            updateData.Payment_Status = 'Paid'; // Assuming delivered means paid
        }
        if (newStatus === 'Cancelled' && previousStatus !== 'Cancelled') {
            updateData.Cancelled_Date = new Date().toISOString().split('T')[0];
            updateData.Payment_Status = 'Refund Pending'; // Assuming cancellation implies refund if paid
        }

        await postToWebhook(API.updateOrder, updateData);

        // If order is confirmed for the first time, deduct stock
        if (newStatus === 'Confirmed' && previousStatus !== 'Confirmed' && order.Serial_No) {
            await deductStockForOrder(order.Serial_No, parseInt(order.Quantity) || 1);
        }
        // If an order is cancelled, consider adding stock back (optional logic)
        if (newStatus === 'Cancelled' && previousStatus !== 'Cancelled' && order.Serial_No) {
            // Here you might want to ask user if they want to restock or automatically restock
            showToast(`Order ${orderId} cancelled. Manually adjust product ${order.Serial_No} stock if needed.`, 'info', 7000);
        }

        closeModal('order-modal');
        await loadAllData(); // Reload all data to refresh tables

        showToast(`Order ${orderId} updated to ${newStatus} successfully!`, 'success');
    } catch (error) {
        console.error('Order update error:', error);
        showToast('Error updating order: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Tracking Modal (for quick tracking updates from main table)
function openTrackingModal(orderId, phone, customerName) {
    const order = allData.orders.find(o => o.Order_ID === orderId);

    document.getElementById('tracking-order-id-input').value = orderId;
    document.getElementById('tracking-phone').value = phone;
    document.getElementById('tracking-customer-name').value = customerName;
    document.getElementById('tracking-id-input').value = order?.Tracking_ID || '';
    document.getElementById('tracking-courier').value = order?.Tracking_Courier || 'BlueDart';
    document.getElementById('tracking-link').value = order?.Tracking_URL || '';
    document.getElementById('tracking-notify').checked = true; // Default to notify customer

    openModal('tracking-modal');
}

async function addTrackingFromModal() {
    const orderId = document.getElementById('tracking-order-id-input').value;
    const trackingId = document.getElementById('tracking-id-input').value.trim();
    const courier = document.getElementById('tracking-courier').value;
    const trackingLink = document.getElementById('tracking-link').value.trim();
    const notifyWhatsapp = document.getElementById('tracking-notify').checked;
    const phone = document.getElementById('tracking-phone').value;
    const customerName = document.getElementById('tracking-customer-name').value;

    if (!orderId || !trackingId) {
        showToast('Order ID and Tracking ID are required.', 'error');
        return;
    }

    try {
        showLoading(true, 'Updating tracking information...');

        const updateData = {
            Order_ID: orderId,
            Tracking_ID: trackingId,
            Tracking_Courier: courier,
            Tracking_URL: trackingLink,
            Status: 'Shipped', // Assuming adding tracking means status is Shipped
            Dispatched_Date: new Date().toISOString().split('T')[0] // Set dispatched date
        };

        await postToWebhook(API.addTracking, updateData);

        // Send WhatsApp notification if enabled
        if (notifyWhatsapp && phone) {
            const trackingMessage = `🚚 *Order Shipped!*\n\nHello ${customerName},\n\nGreat news! Your order #${orderId} has been shipped.\n\n📦 *Tracking Details:*\n• Courier: ${courier}\n• Tracking ID: ${trackingId}\n${trackingLink ? `• Track here: ${trackingLink}` : ''}\n\nThank you for shopping with Mamta Saree! 🙏`;

            await sendWhatsappMessage(phone, trackingMessage);
        }

        closeModal('tracking-modal');
        await loadAllData();

        showToast('Tracking information updated successfully!', 'success');
    } catch (error) {
        console.error('Add tracking error:', error);
        showToast('Error adding tracking: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Soft Delete (Cancel) Order
async function deleteOrder(orderId) {
    const order = allData.orders.find(o => o.Order_ID === orderId);
    if (!order) {
        showToast('Order not found.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to CANCEL Order ID ${orderId} by ${order.Customer_Name}? This will mark it as "Cancelled" and update payment status.`)) {
        return;
    }

    try {
        showLoading(true, `Cancelling order ${orderId}...`);

        const updateData = {
            Order_ID: orderId,
            Status: 'Cancelled',
            Payment_Status: 'Refund Pending', // Assuming cancellation implies refund if paid or marking as refund pending
            Cancelled_Date: new Date().toISOString().split('T')[0]
        };

        await postToWebhook(API.updateOrder, updateData);

        if (order.Serial_No && parseInt(order.Quantity || 0) > 0) {
            showToast('Order cancelled. Please manually adjust product stock if it was deducted.', 'info', 7000);
        }

        await loadAllData();
        showToast(`Order ID ${orderId} marked as "Cancelled".`, 'success');
    } catch (error) {
        console.error('Cancel order error:', error);
        showToast('Error cancelling order: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}


function viewPayment(paymentId) {
    const payment = allData.payments.find(p => p.Payment_ID === paymentId);
    if (!payment) {
        showToast('Payment not found.', 'error');
        return;
    }

    const modalBody = document.getElementById('payment-modal-body');
    if (!modalBody) return;

    const screenshotUrl = payment.Screenshot_URL ? convertDriveLink(payment.Screenshot_URL) : null;
    const canVerify = payment.Status?.toLowerCase() === 'pending verification' || payment.Status?.toLowerCase() === 'pending';

    modalBody.innerHTML = `
        <div class="detail-grid">
            <div class="detail-section">
                <h4><i class="fas fa-receipt"></i> Payment Information</h4>
                <div class="detail-row">
                    <span class="label">Payment ID:</span>
                    <span class="value">${escapeHtml(payment.Payment_ID || '-')}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Order ID:</span>
                    <span class="value"><a href="#" onclick="event.preventDefault(); closeModal('payment-modal'); viewOrder('${escapeHtml(payment.Order_ID || '')}')"><strong>${escapeHtml(payment.Order_ID || '-')}</strong></a></span>
                </div>
                <div class="detail-row">
                    <span class="label">Date:</span>
                    <span class="value">${formatDateTime(payment.Payment_Date || payment.Date || payment.Timestamp)}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Amount:</span>
                    <span class="value highlight">₹${formatNumber(payment.Amount || 0)}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Type:</span>
                    <span class="value"><span class="status-badge ${getPaymentTypeClass(payment.Payment_Type)}">${escapeHtml(payment.Payment_Type || 'N/A')}</span></span>
                </div>
                <div class="detail-row">
                    <span class="label">Status:</span>
                    <span class="value"><span class="status-badge ${getStatusClass(payment.Status)}">${escapeHtml(payment.Status || 'Pending')}</span></span>
                </div>
                ${screenshotUrl ? `
                    <div class="detail-row">
                        <span class="label">Screenshot:</span>
                        <span class="value">
                            <button class="btn btn-sm btn-outline" onclick="viewScreenshot('${escapeHtml(screenshotUrl)}')">
                                <i class="fas fa-image"></i> View Screenshot
                            </button>
                        </span>
                    </div>
                ` : ''}
            </div>
            <div class="detail-section">
                <h4><i class="fas fa-user"></i> Customer Details</h4>
                <div class="detail-row">
                    <span class="label">Name:</span>
                    <span class="value">${escapeHtml(payment.Customer_Name || payment.Name || '-')}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Phone:</span>
                    <span class="value">
                        ${payment.Phone ? `
                            <a href="tel:${escapeHtml(payment.Phone)}" class="phone-link">${escapeHtml(payment.Phone)}</a>
                            <button class="btn-icon small" onclick="openWhatsApp('${escapeHtml(payment.Phone)}')" title="WhatsApp">
                                <i class="fab fa-whatsapp"></i>
                            </button>
                        ` : '-'}
                    </span>
                </div>
            </div>
        </div>
        ${canVerify ? `
            <div class="payment-actions-section" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                <h4><i class="fas fa-check-circle"></i> Payment Verification</h4>
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button class="btn btn-success" onclick="verifyPayment('${escapeHtml(payment.Payment_ID)}', '${escapeHtml(payment.Order_ID || '')}')">
                        <i class="fas fa-check"></i> Verify Payment
                    </button>
                    <button class="btn btn-danger" onclick="rejectPayment('${escapeHtml(payment.Payment_ID)}', '${escapeHtml(payment.Order_ID || '')}')">
                        <i class="fas fa-times"></i> Reject Payment
                    </button>
                </div>
            </div>
        ` : ''}
    `;

    openModal('payment-modal');
}

// View payment screenshot
function viewScreenshot(imageUrl) {
    if (!imageUrl) {
        showToast('Screenshot URL not available.', 'warning');
        return;
    }
    viewProductImage(imageUrl, 'Payment Screenshot');
}

// Verify payment
async function verifyPayment(paymentId, orderId) {
    if (!confirm('Are you sure you want to verify this payment?')) {
        return;
    }

    try {
        showLoading(true, 'Verifying payment...');

        const updateData = {
            Payment_ID: paymentId,
            Status: 'Verified',
            Verified_Date: new Date().toISOString()
        };

        // Also update order payment status if order ID is provided
        if (orderId) {
            const order = allData.orders.find(o => o.Order_ID === orderId);
            if (order) {
                await postToWebhook(API.updateOrder, {
                    Order_ID: orderId,
                    Payment_Status: 'Paid'
                });
            }
        }

        await postToWebhook(API.updatePayment || API.updateOrder, updateData);

        closeModal('payment-modal');
        await loadAllData();

        showToast('Payment verified successfully!', 'success');
    } catch (error) {
        console.error('Verify payment error:', error);
        showToast('Error verifying payment: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Reject payment
async function rejectPayment(paymentId, orderId) {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) {
        return;
    }

    if (!confirm(`Are you sure you want to reject this payment?\nReason: ${reason}`)) {
        return;
    }

    try {
        showLoading(true, 'Rejecting payment...');

        const updateData = {
            Payment_ID: paymentId,
            Status: 'Rejected',
            Rejection_Reason: reason,
            Rejected_Date: new Date().toISOString()
        };

        await postToWebhook(API.updatePayment || API.updateOrder, updateData);

        closeModal('payment-modal');
        await loadAllData();

        showToast('Payment rejected.', 'warning');
    } catch (error) {
        console.error('Reject payment error:', error);
        showToast('Error rejecting payment: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// CUSTOMER ACTIONS & MODALS
// ==========================================
function openCustomerModal(phoneToEdit = null) {
    const isEdit = phoneToEdit !== null;
    const customer = isEdit ? allData.customers.find(c => c.Phone === phoneToEdit) : {};

    document.getElementById('customer-modal-title').textContent = isEdit ? 'Edit Customer' : 'Add Customer';
    document.getElementById('customer-edit-phone').value = isEdit ? phoneToEdit : '';

    document.getElementById('customer-name-input').value = customer?.Customer_Name || customer?.Name || '';
    document.getElementById('customer-phone-input').value = customer?.Phone || '';
    document.getElementById('customer-email-input').value = customer?.Email || '';
    document.getElementById('customer-address-input').value = customer?.Address || customer?.Delivery_Address || '';

    // If editing, phone should be read-only as it's often the unique identifier
    document.getElementById('customer-phone-input').readOnly = isEdit;

    openModal('customer-modal');
}

async function saveCustomer() {
    const editPhone = document.getElementById('customer-edit-phone').value;
    const isEdit = editPhone !== '';

    const customerData = {
        Customer_Name: document.getElementById('customer-name-input').value.trim(),
        Phone: document.getElementById('customer-phone-input').value.trim(),
        Email: document.getElementById('customer-email-input').value.trim(),
        Address: document.getElementById('customer-address-input').value.trim()
    };

    if (!customerData.Customer_Name || !customerData.Phone) {
        showToast('Name and Phone are required.', 'error');
        return;
    }

    try {
        showLoading(true, `Saving customer ${customerData.Customer_Name}...`);
        const endpoint = isEdit ? API.updateCustomer : API.addCustomer;
        await postToWebhook(endpoint, customerData);
        closeModal('customer-modal');
        await loadAllData();
        showToast(`Customer ${customerData.Customer_Name} ${isEdit ? 'updated' : 'added'} successfully!`, 'success');
    } catch (error) {
        console.error('Save customer error:', error);
        showToast('Error saving customer: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}


// ==========================================
// LEAD ACTIONS & MODALS
// ==========================================
function openLeadModal(phoneToEdit = null) {
    const isEdit = phoneToEdit !== null;
    const lead = isEdit ? allData.leads.find(l => l.Phone === phoneToEdit) : {};

    document.getElementById('lead-modal-title').textContent = isEdit ? 'Edit Lead' : 'Add Lead';
    document.getElementById('lead-edit-phone').value = isEdit ? phoneToEdit : '';

    document.getElementById('lead-name-input').value = lead?.Name || '';
    document.getElementById('lead-phone-input').value = lead?.Phone || '';
    document.getElementById('lead-email-input').value = lead?.Email || '';
    document.getElementById('lead-source-input').value = lead?.Source || 'Other'; // Default source to 'Other'
    document.getElementById('lead-status-input').value = lead?.Status || 'New';
    document.getElementById('lead-notes-input').value = lead?.Notes || '';

    // If editing, phone should be read-only as it's often the unique identifier
    document.getElementById('lead-phone-input').readOnly = isEdit;

    openModal('lead-modal');
}

async function saveLead() {
    const editPhone = document.getElementById('lead-edit-phone').value;
    const isEdit = editPhone !== '';

    const leadData = {
        Name: document.getElementById('lead-name-input').value.trim(),
        Phone: document.getElementById('lead-phone-input').value.trim(),
        Email: document.getElementById('lead-email-input').value.trim(),
        Source: document.getElementById('lead-source-input').value.trim(),
        Status: document.getElementById('lead-status-input').value,
        Notes: document.getElementById('lead-notes-input').value.trim()
    };
    if (!isEdit) {
        leadData.Timestamp = new Date().toISOString(); // Add timestamp for new leads
    }

    if (!leadData.Name || !leadData.Phone) {
        showToast('Name and Phone are required.', 'error');
        return;
    }

    try {
        showLoading(true, `Saving lead ${leadData.Name}...`);
        const endpoint = isEdit ? API.updateLead : API.addLead;
        await postToWebhook(endpoint, leadData);
        closeModal('lead-modal');
        await loadAllData();
        showToast(`Lead ${leadData.Name} ${isEdit ? 'updated' : 'added'} successfully!`, 'success');
    } catch (error) {
        console.error('Save lead error:', error);
        showToast('Error saving lead: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// DROPDOWNS FOR TABLE ACTION BUTTONS
// ==========================================
function setupDropdowns() {
    // Remove all previous dropdowns to prevent duplicates/multiple event listeners
    // This is important because renderOrders is called repeatedly.
    document.querySelectorAll('.dropdown .dropdown-content').forEach(dropdown => {
        dropdown.remove();
    });

    // Create and attach new dropdowns
    document.querySelectorAll('.dropdown').forEach(dropdown => {
        const btn = dropdown.querySelector('.action-btn.menu');
        if (!btn) return;

        // Get order ID from parent row
        const orderId = dropdown.closest('tr')?.querySelector('td:first-child strong')?.textContent || '';
        const order = allData.orders.find(o => o.Order_ID === orderId);

        const content = document.createElement('div');
        content.className = 'dropdown-content';
        content.innerHTML = `
            <a href="#" onclick="event.preventDefault(); sendWhatsappMessageForOrder('${escapeHtml(orderId)}', 'confirmation')">
                <i class="fab fa-whatsapp"></i> Send Conf. Msg
            </a>
            ${order?.Tracking_ID ? `
            <a href="#" onclick="event.preventDefault(); sendWhatsappMessageForOrder('${escapeHtml(orderId)}', 'tracking')">
                <i class="fab fa-whatsapp"></i> Send Tracking Msg
            </a>
            ` : ''}
            <div class="dropdown-divider"></div>
            <a href="#" onclick="event.preventDefault(); deleteOrder('${escapeHtml(orderId)}')" class="text-danger">
                <i class="fas fa-trash"></i> Cancel Order
            </a>
        `;

        dropdown.appendChild(content);

        // Add click listener to the button
        // Clone and replace to remove old event listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Close other open dropdowns
            document.querySelectorAll('.dropdown-content.show').forEach(openDropdown => {
                if (openDropdown !== content) {
                    openDropdown.classList.remove('show');
                }
            });

            // Toggle this dropdown
            content.classList.toggle('show');
        };
    });
}

function closeAllDropdowns(event) {
    if (!event.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-content.show').forEach(openDropdown => {
            openDropdown.classList.remove('show');
        });
    }
}


// ==========================================
// LOW STOCK CHECK & NOTIFICATION
// ==========================================
function checkLowStock() {
    const lowStockProducts = allData.products.filter(p => {
        const qty = parseInt(p.Stock_Qty) || 0;
        return qty > 0 && qty <= LOW_STOCK_THRESHOLD;
    });

    const outOfStockProducts = allData.products.filter(p => {
        const qty = parseInt(p.Stock_Qty) || 0;
        return qty === 0;
    });

    showStockAlert(lowStockProducts, outOfStockProducts);
}

function showStockAlert(lowStock, outOfStock) {
    const alertContainer = document.getElementById('stock-alerts');
    if (!alertContainer) return;

    let html = '';

    if (outOfStock.length > 0) {
        html += `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle"></i>
                <div>
                    <strong>Out of Stock (${outOfStock.length})</strong>
                    <p>${outOfStock.slice(0, 5).map(p => escapeHtml(p.Saree_Name || p.Serial_No)).join(', ')}${outOfStock.length > 5 ? '...' : ''}</p>
                </div>
            </div>
        `;
    }

    if (lowStock.length > 0) {
        html += `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>Low Stock (${lowStock.length})</strong>
                    <p>${lowStock.slice(0, 5).map(p => `${escapeHtml(p.Saree_Name || p.Serial_No)} (${p.Stock_Qty})`).join(', ')}${lowStock.length > 5 ? '...' : ''}</p>
                </div>
            </div>
        `;
    }

    alertContainer.innerHTML = html;
}


// ==========================================
// INITIALIZATION AND EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadAllData(); // Now `loadAllData` is defined above
    startAutoRefresh();
    switchTab('dashboard'); // Default tab
});

function switchTab(tab) {
    // Update active state for menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
        item.setAttribute('aria-current', item.dataset.tab === tab ? 'page' : 'false');
    });

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        const isActive = content.id === `${tab}-tab`;
        content.classList.toggle('active', isActive);
        content.setAttribute('aria-hidden', (!isActive).toString());
    });

    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'products': 'Products',
        'orders': 'Orders',
        'payments': 'Payments',
        'customers': 'Customers',
        'leads': 'Leads',
        'conversations': 'Conversations',
        'daily-report': 'Daily Report'
    };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.textContent = titles[tab] || 'Dashboard';
    }

    // Update document title for better UX
    document.title = `${titles[tab] || 'Dashboard'} - Mamta Saree Admin`;

    // Rerender specific tabs when switched to ensure latest data/filters
    // This provides a fresh UI update for the active tab.
    switch(tab) {
        case 'dashboard': renderDashboard(); break;
        case 'products': renderProducts(); break;
        case 'orders': renderOrders(); break;
        case 'payments': renderPayments(); break;
        case 'customers': renderCustomers(); break;
        case 'leads': renderLeads(); break;
        case 'conversations': renderConversations(); break;
        case 'daily-report': renderDailyReport(); break;
    }
}

function setupEventListeners() {
    // Sidebar toggle
    const toggleBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const isMobile = window.innerWidth <= 992;
            
            if (isMobile) {
                // Mobile behavior: toggle active class (show/hide sidebar)
                const isActive = sidebar.classList.contains('active');
                sidebar.classList.toggle('active');
                
                // Update icon
                const icon = toggleBtn.querySelector('i');
                if (icon) {
                    if (sidebar.classList.contains('active')) {
                        icon.className = 'fas fa-arrow-left'; // Sidebar visible, show arrow to close
                    } else {
                        icon.className = 'fas fa-bars'; // Sidebar hidden, show bars to open
                    }
                }
                
                // Update aria-expanded
                toggleBtn.setAttribute('aria-expanded', sidebar.classList.contains('active').toString());
            } else {
                // Desktop behavior: toggle collapsed class (collapse/expand sidebar)
                const isCollapsed = sidebar.classList.contains('collapsed');
                sidebar.classList.toggle('collapsed');
                
                // Update main content width
                const mainContent = document.getElementById('main-content');
                if (mainContent) {
                    if (sidebar.classList.contains('collapsed')) {
                        mainContent.style.width = 'calc(100% - 80px)';
                    } else {
                        mainContent.style.width = '70%';
                    }
                }
                
                // Update icon
                const icon = toggleBtn.querySelector('i');
                if (icon) {
                    if (sidebar.classList.contains('collapsed')) {
                        icon.className = 'fas fa-arrow-left'; // Collapsed (only icons), show arrow-left to expand
                    } else {
                        icon.className = 'fas fa-bars'; // Expanded (icons + names), show bars to collapse
                    }
                }
                
                // Update aria-expanded
                toggleBtn.setAttribute('aria-expanded', (!sidebar.classList.contains('collapsed')).toString());
            }
        });
    }

    // Menu items for tab switching
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);
            // On mobile, close sidebar after clicking a menu item
            if (window.innerWidth <= 992) { // Using 992px as a breakpoint for mobile-like sidebar behavior
                const sidebar = document.getElementById('sidebar');
                const toggleBtn = document.getElementById('toggle-sidebar');
                if (sidebar?.classList.contains('active')) {
                    sidebar.classList.remove('active');
                    sidebar.classList.add('collapsed'); // Restore collapsed state after hiding
                    document.getElementById('main-content')?.classList.remove('expanded');
                    const icon = toggleBtn?.querySelector('i');
                    if (icon) icon.className = 'fas fa-bars';
                }
            }
        });
    });

    // Refresh button with loading state
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const icon = refreshBtn.querySelector('i');
            if (icon) {
                icon.classList.add('fa-spin');
                loadAllData().finally(() => {
                    setTimeout(() => {
                        icon.classList.remove('fa-spin');
                    }, 500);
                });
            } else {
                loadAllData();
            }
        });
    }

    // Search inputs with debounce for better performance
    setupSearchWithDebounce('product-search', filterProducts);
    setupSearchWithDebounce('order-search', () => renderOrders());
    setupSearchWithDebounce('payment-search', filterPayments);
    setupSearchWithDebounce('customer-search', filterCustomers);
    setupSearchWithDebounce('lead-search', filterLeads);
    setupSearchWithDebounce('conversation-search', () => renderConversations());

    // Order filter dropdowns and date inputs (trigger re-render directly)
    document.getElementById('order-status-filter')?.addEventListener('change', () => renderOrders());
    document.getElementById('order-payment-filter')?.addEventListener('change', () => renderOrders());
    document.getElementById('order-date-from')?.addEventListener('change', () => renderOrders());
    document.getElementById('order-date-to')?.addEventListener('change', () => renderOrders());

    // Conversation filter date inputs (trigger re-render directly)
    document.getElementById('conversation-date-from')?.addEventListener('change', () => renderConversations());
    document.getElementById('conversation-date-to')?.addEventListener('change', () => renderConversations());

    // Report filter buttons
    document.querySelectorAll('#report-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#report-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderDailyReport();
        });
    });

    // Product image URL preview in modal
    document.getElementById('product-image')?.addEventListener('input', (e) => {
        previewImage(e.target.value);
    });

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
            document.body.style.overflow = '';
        }
    });

    // Dropdown close on outside click (for action buttons in tables)
    document.addEventListener('click', closeAllDropdowns);
}

// Helper for debouncing search inputs
function setupSearchWithDebounce(inputId, callback) {
    const input = document.getElementById(inputId);
    if (!input) return;

    let timeout;
    input.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(callback, 300);
    });
    
    // Also trigger on Enter key for immediate search
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(timeout);
            callback();
        }
    });
}

// Debounce helper function for reuse
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}