// ==========================================
// MAMTA SAREE ADMIN DASHBOARD - COMPLETE FIXED
// Version: 4.0 - All Issues Fixed
// ==========================================

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
    SHEET_ID: '1fwN4eup-90LV4n8ZuJ2okmn1lM5gzO1h7t8_aZ-0M-E',
    API_KEY: 'AIzaSyAVZw0YNSzwcWt1afw9dwNtpDfjhRvdlmo',
    N8N_BASE_URL: 'https://n8n.srv1114630.hstgr.cloud/webhook',
    WHATSAPP_API: 'https://thinkaiq.in/api/39620217-6b32-4554-80ea-51c84db06f46/contact/send-message',
    WHATSAPP_TOKEN: 'ruFA4YRHbJ0e5Sw08p4ZPLDkeYhqKUhi8GZZtSvZmYzzXXInxxR539GJ9GJQ0q9K',
    BUSINESS_PHONE: '8252472186',
    LOW_STOCK_THRESHOLD: 5,
    AUTO_REFRESH_INTERVAL: 120000,
    
    // Sheet Names - EXACT names as in your Google Sheet
    SHEETS: {
        PRODUCTS: 'Products',      // Note: space at end
        ORDERS: 'Orders',
        PAYMENTS: 'Payments',      // Note: space at end
        CUSTOMERS: 'Customers',
        LEADS: 'Leads'
    }
};

// API Endpoints
const API = {
    // n8n endpoints for updates
    updateOrder: `${CONFIG.N8N_BASE_URL}/mamta-saree/orders/update`,
    addTracking: `${CONFIG.N8N_BASE_URL}/mamta-saree/orders/tracking`,
    approvePayment: `${CONFIG.N8N_BASE_URL}/mamta-saree/payments/approve`,
    rejectPayment: `${CONFIG.N8N_BASE_URL}/mamta-saree/payments/reject`,
    addProduct: `${CONFIG.N8N_BASE_URL}/mamta-saree/products/add`,
    updateProduct: `${CONFIG.N8N_BASE_URL}/mamta-saree/products/update`,
    deleteProduct: `${CONFIG.N8N_BASE_URL}/mamta-saree/products/delete`,
    addLead: `${CONFIG.N8N_BASE_URL}/mamta-saree/leads/add`,
    updateLead: `${CONFIG.N8N_BASE_URL}/mamta-saree/leads/update`,
};

// ==========================================
// GLOBAL DATA STORE
// ==========================================
let allData = {
    products: [],
    orders: [],
    payments: [],
    customers: [],
    leads: []
};

let currentLeadFilter = 'all';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function formatNumber(num) {
    if (!num) return '0';
    return parseFloat(num).toLocaleString('en-IN');
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        if (isNaN(date)) return dateStr;
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
}

function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        if (isNaN(date)) return dateStr;
        return date.toLocaleString('en-IN', { 
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return dateStr; }
}

function getStatusClass(status) {
    if (!status) return 'pending';
    const s = status.toLowerCase();
    if (s.includes('deliver') || s.includes('verified') || s.includes('paid')) return 'delivered';
    if (s.includes('ship') || s.includes('dispatch')) return 'shipped';
    if (s.includes('confirm')) return 'confirmed';
    if (s.includes('pending') || s.includes('process')) return 'pending';
    if (s.includes('cancel') || s.includes('reject')) return 'cancelled';
    if (s === 'hot') return 'hot';
    if (s === 'warm') return 'warm';
    if (s === 'cold') return 'cold';
    return 'pending';
}

function convertDriveLink(url) {
    if (!url) return '';
    if (url.includes('drive.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
    }
    return url;
}

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${escapeHtml(message)}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showLoading(show, message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const msg = document.getElementById('loading-message');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
        if (msg) msg.textContent = message;
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ==========================================
// DATA FETCHING - GOOGLE SHEETS API
// ==========================================

async function fetchSheet(sheetName) {
    // Encode sheet name properly (handles spaces and special characters)
    // Google Sheets API requires single quotes around sheet names with special chars
    let encodedName = sheetName;
    if (sheetName.includes(' ') || sheetName.includes('_') || sheetName.includes('-')) {
        encodedName = `'${sheetName}'`;
    }
    encodedName = encodeURIComponent(encodedName);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodedName}?key=${CONFIG.API_KEY}`;
    
    try {
        console.log(`📥 Fetching: "${sheetName}" (encoded: ${encodedName})`);
        console.log(`📥 Full URL: ${url.substring(0, 100)}...`);
        const res = await fetch(url);
        const data = await res.json();
        
        // Debug: Log full response for customers sheet
        if (sheetName.toLowerCase().includes('customer')) {
            console.log(`🔍 Customer sheet API response:`, data);
            console.log(`🔍 data.values length:`, data.values ? data.values.length : 'null');
            if (data.values && data.values.length > 0) {
                console.log(`🔍 First row (headers):`, data.values[0]);
                console.log(`🔍 Total rows:`, data.values.length);
            }
        }
        
        if (data.error) {
            console.error(`❌ Sheet error for "${sheetName}":`, data.error.message);
            console.error(`❌ Full error:`, data.error);
            // Try without trailing space
            if (sheetName.endsWith(' ')) {
                console.log(`🔄 Retrying without trailing space...`);
                return await fetchSheet(sheetName.trim());
            }
            return [];
        }
        
        if (!data.values) {
            console.warn(`⚠️ No values array in response for "${sheetName}"`);
            return [];
        }
        
        if (data.values.length < 2) {
            console.warn(`⚠️ Sheet "${sheetName}" has only ${data.values.length} row(s) (need at least header + 1 data row)`);
            if (data.values.length === 1) {
                console.log(`📋 Headers found:`, data.values[0]);
            }
            return [];
        }
        
        const headers = data.values[0].map(h => h.trim().replace(/\s+/g, '_'));
        const rows = data.values.slice(1).map(row => {
            const obj = {};
            headers.forEach((h, i) => obj[h] = row[i] || '');
            return obj;
        });
        
        // Filter out completely empty rows
        const validRows = rows.filter(row => {
            return Object.values(row).some(val => val && val.toString().trim() !== '');
        });
        
        console.log(`✅ ${sheetName}: ${validRows.length} valid rows loaded (out of ${rows.length} total rows)`);
        if (validRows.length > 0) {
            console.log(`📋 ${sheetName} Headers:`, headers);
            console.log(`📋 ${sheetName} Sample Data:`, validRows[0]);
        } else if (rows.length > 0) {
            console.warn(`⚠️ ${sheetName}: All rows appear to be empty`);
            console.log(`📋 Sample empty row:`, rows[0]);
        }
        return validRows;
    } catch (error) {
        console.error(`❌ Error fetching ${sheetName}:`, error);
        return [];
    }
}

// Alternative: Fetch by Sheet GID (more reliable)
async function fetchSheetByGid(gid, sheetName) {
    // First get all sheet metadata
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}?key=${CONFIG.API_KEY}`;
    
    try {
        const metaRes = await fetch(metaUrl);
        const metaData = await metaRes.json();
        
        if (metaData.error) {
            console.error('Metadata error:', metaData.error);
            return [];
        }
        
        // Find sheet by gid
        const sheet = metaData.sheets?.find(s => s.properties.sheetId === gid);
        if (!sheet) {
            console.error(`Sheet with gid ${gid} not found`);
            return [];
        }
        
        const actualName = sheet.properties.title;
        console.log(`📋 Found sheet: "${actualName}" (gid: ${gid})`);
        
        return await fetchSheet(actualName);
    } catch (error) {
        console.error('Error:', error);
        return [];
    }
}

async function postToWebhook(url, data) {
    try {
        console.log('📤 POST to:', url);
        console.log('📦 Data:', data);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const text = await response.text();
        console.log('📨 Response:', text);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text}`);
        }
        
        return text ? JSON.parse(text) : { success: true };
    } catch (error) {
        console.error('❌ POST error:', error);
        throw error;
    }
}

async function loadAllData(silent = false) {
    if (!silent) showLoading(true, 'Data load ho raha hai...');
    
    try {
        // Try fetching with correct sheet names
        // First, get actual sheet names from metadata
        const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}?key=${CONFIG.API_KEY}`;
        const metaRes = await fetch(metaUrl);
        const metaData = await metaRes.json();
        
        if (metaData.error) {
            throw new Error(metaData.error.message);
        }
        
        // Get actual sheet names
        const sheetNames = {};
        const allSheetTitles = metaData.sheets?.map(s => s.properties.title) || [];
        
        metaData.sheets?.forEach(sheet => {
            const title = sheet.properties.title.toLowerCase().trim();
            const actualTitle = sheet.properties.title;
            
            if (title.includes('product')) sheetNames.products = actualTitle;
            else if (title === 'orders' || title.includes('order')) sheetNames.orders = actualTitle;
            else if (title.includes('payment')) sheetNames.payments = actualTitle;
            else if (title.includes('customer')) sheetNames.customers = actualTitle;
            else if (title.includes('lead')) sheetNames.leads = actualTitle;
        });
        
        // Fallback: Try exact match for common sheet names
        if (!sheetNames.customers) {
            const exactMatch = allSheetTitles.find(t => t.toLowerCase() === 'customers');
            if (exactMatch) sheetNames.customers = exactMatch;
        }
        
        console.log('📋 Found sheets:', sheetNames);
        console.log('📋 All available sheets:', allSheetTitles);
        
        // Fetch all sheets in parallel
        let [products, orders, payments, customers, leads] = await Promise.all([
            sheetNames.products ? fetchSheet(sheetNames.products) : Promise.resolve([]),
            sheetNames.orders ? fetchSheet(sheetNames.orders) : Promise.resolve([]),
            sheetNames.payments ? fetchSheet(sheetNames.payments) : Promise.resolve([]),
            sheetNames.customers ? fetchSheet(sheetNames.customers) : Promise.resolve([]),
            sheetNames.leads ? fetchSheet(sheetNames.leads) : Promise.resolve([])
        ]);
        
        // Debug customers specifically
        if (sheetNames.customers) {
            console.log('👥 Customers sheet name:', sheetNames.customers);
            console.log('👥 Customers data loaded:', customers.length, 'rows');
            if (customers.length === 0) {
                // Try fetching by GID if name fetch failed
                const customerSheet = metaData.sheets?.find(s => 
                    s.properties.title.toLowerCase().includes('customer')
                );
                if (customerSheet) {
                    console.log('🔄 Customers sheet found by GID:', customerSheet.properties.sheetId);
                    console.log('🔄 Actual sheet title:', customerSheet.properties.title);
                    // Try fetching again with exact title
                    const retryFetch = await fetchSheet(customerSheet.properties.title);
                    if (retryFetch.length > 0) {
                        console.log('✅ Retry fetch successful! Got', retryFetch.length, 'customers');
                        customers = retryFetch;
                    }
                }
            }
            if (customers.length > 0) {
                console.log('👥 ✅ Customers loaded successfully!');
                console.log('👥 First customer raw data:', customers[0]);
            }
        } else {
            console.warn('⚠️ Customers sheet not found! Available sheets:', allSheetTitles);
            // Try common customer sheet names
            const commonNames = ['Customers', 'Customer_Memory', 'Customer Memory', 'customer'];
            for (const name of commonNames) {
                const found = allSheetTitles.find(t => t.toLowerCase() === name.toLowerCase());
                if (found) {
                    console.log(`💡 Trying alternative sheet name: "${found}"`);
                    try {
                        const altFetch = await fetchSheet(found);
                        if (altFetch.length > 0) {
                            console.log(`✅ Found customers in "${found}"! Got ${altFetch.length} rows`);
                            customers = altFetch;
                            break;
                        }
                    } catch (err) {
                        console.error(`❌ Failed to fetch "${found}":`, err);
                    }
                }
            }
        }
        
        allData.products = products;
        allData.orders = orders;
        allData.payments = payments;
        allData.customers = customers;
        allData.leads = leads;
        
        console.log('📊 All Data Loaded:', {
            products: products.length,
            orders: orders.length,
            payments: payments.length,
            customers: customers.length,
            leads: leads.length
        });
        
        // Debug: Log sample customer data
        if (customers.length > 0) {
            console.log('👥 ✅ Customers loaded successfully!');
            console.log('👥 Total customers:', customers.length);
            console.log('👥 Sample customer:', customers[0]);
            console.log('👥 Customer keys:', Object.keys(customers[0]));
            console.log('👥 Customer data structure:', JSON.stringify(customers[0], null, 2));
        } else {
            console.warn('⚠️ No customers loaded from Customers sheet!');
            // Always try to derive customers from orders as backup
            if (orders.length > 0) {
                console.log('💡 Deriving customers from orders...');
                const uniqueCustomers = {};
                orders.forEach(order => {
                    const phone = (order.Phone || '').toString().trim();
                    if (phone && phone.length >= 10) {
                        // Normalize phone number (remove spaces, dashes, etc.)
                        const normalizedPhone = phone.replace(/[^0-9]/g, '');
                        if (normalizedPhone.length >= 10 && !uniqueCustomers[normalizedPhone]) {
                            uniqueCustomers[normalizedPhone] = {
                                Customer_Name: getField(order, 'Customer_Name', 'Name', 'Customer Name', 'customer_name', 'name') || 'Unknown Customer',
                                Phone: phone,
                                Email: getField(order, 'Email', 'email') || '',
                                Address: getField(order, 'Delivery_Address', 'Address', 'Delivery Address', 'address', 'delivery_address') || ''
                            };
                        }
                    }
                });
                if (Object.keys(uniqueCustomers).length > 0) {
                    allData.customers = Object.values(uniqueCustomers);
                    console.log(`✅ Derived ${allData.customers.length} customers from orders`);
                    console.log('👥 Sample derived customer:', allData.customers[0]);
                } else {
                    console.warn('⚠️ Could not derive customers from orders either');
                }
            } else {
                console.warn('⚠️ No orders available to derive customers from');
            }
        }
        
        renderAll();
        if (!silent) showToast('✅ Data loaded!', 'success');
    } catch (error) {
        console.error('❌ Load error:', error);
        if (!silent) showToast('Error: ' + error.message, 'error');
    } finally {
        if (!silent) showLoading(false);
    }
}

function renderAll() {
    renderDashboard();
    renderProducts();
    renderOrders();
    renderPayments();
    renderCustomers();
    renderLeads();
}

// ==========================================
// WHATSAPP - VIA N8N WEBHOOK
// ==========================================

async function sendWhatsAppViaN8N(phone, message, customerName = '') {
    if (!phone) {
        showToast('Phone number missing!', 'error');
        return false;
    }
    
    // Clean phone number
    let cleanPhone = phone.toString().replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    
    try {
        console.log('📱 Sending WhatsApp via n8n to:', cleanPhone);
        
        // Use ThinkAIQ API directly
        const response = await fetch(CONFIG.WHATSAPP_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.WHATSAPP_TOKEN}`
            },
            body: JSON.stringify({
                phone_number: cleanPhone,
                message_body: message
            })
        });
        
        const result = await response.text();
        console.log('WhatsApp Response:', result);
        
        if (response.ok) {
            showToast('✅ WhatsApp sent!', 'success');
            return true;
        } else {
            throw new Error(result);
        }
    } catch (error) {
        console.error('WhatsApp error:', error);
        showToast('❌ WhatsApp failed!', 'error');
        return false;
    }
}

function openWhatsApp(phone) {
    if (!phone) return showToast('Phone missing!', 'warning');
    const clean = phone.toString().replace(/[^0-9]/g, '');
    window.open(`https://wa.me/91${clean}`, '_blank');
}

// ==========================================
// DASHBOARD
// ==========================================

function renderDashboard() {
    const stats = document.getElementById('dashboard-stats');
    if (!stats) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totalOrders = allData.orders.filter(o => o.Status?.toLowerCase() !== 'cancelled').length;
    const todayOrders = allData.orders.filter(o => {
        const d = new Date(o.Order_Date || o.Timestamp);
        return d >= today && o.Status?.toLowerCase() !== 'cancelled';
    }).length;
    
    const totalRevenue = allData.orders
        .filter(o => o.Status?.toLowerCase() !== 'cancelled')
        .reduce((sum, o) => sum + (parseFloat(o.Amount) || 0), 0);
    
    const pendingPayments = allData.payments.filter(p => 
        !p.Status || p.Status.toLowerCase().includes('pending')
    ).length;
    
    const hotLeads = allData.leads.filter(l => l.Status?.toLowerCase() === 'hot').length;
    
    stats.innerHTML = `
        <div class="stat-card primary">
            <div class="stat-icon"><i class="fas fa-rupee-sign"></i></div>
            <div class="stat-value">₹${formatNumber(totalRevenue)}</div>
            <div class="stat-label">Total Revenue</div>
        </div>
        <div class="stat-card success">
            <div class="stat-icon"><i class="fas fa-shopping-cart"></i></div>
            <div class="stat-value">${totalOrders}</div>
            <div class="stat-label">Total Orders</div>
            <div class="stat-sub">${todayOrders} today</div>
        </div>
        <div class="stat-card warning">
            <div class="stat-icon"><i class="fas fa-clock"></i></div>
            <div class="stat-value">${pendingPayments}</div>
            <div class="stat-label">Pending Payments</div>
        </div>
        <div class="stat-card info">
            <div class="stat-icon"><i class="fas fa-box"></i></div>
            <div class="stat-value">${allData.products.length}</div>
            <div class="stat-label">Products</div>
        </div>
        <div class="stat-card purple">
            <div class="stat-icon"><i class="fas fa-users"></i></div>
            <div class="stat-value">${allData.customers.length}</div>
            <div class="stat-label">Customers</div>
        </div>
        <div class="stat-card hot">
            <div class="stat-icon"><i class="fas fa-fire"></i></div>
            <div class="stat-value">${hotLeads}</div>
            <div class="stat-label">Hot Leads</div>
        </div>
    `;
    
    renderRecentOrders();
    renderPendingPaymentsList();
}

function renderRecentOrders() {
    const container = document.getElementById('recent-orders');
    if (!container) return;
    
    const recent = [...allData.orders]
        .sort((a, b) => new Date(b.Order_Date || b.Timestamp) - new Date(a.Order_Date || a.Timestamp))
        .slice(0, 5);
    
    if (recent.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No orders yet</p></div>';
        return;
    }
    
    container.innerHTML = `
        <table>
            <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
                ${recent.map(o => `
                    <tr>
                        <td><strong>${escapeHtml(o.Order_ID || '-')}</strong></td>
                        <td>${escapeHtml(o.Customer_Name || '-')}</td>
                        <td>₹${formatNumber(o.Amount)}</td>
                        <td><span class="status-badge ${getStatusClass(o.Status)}">${escapeHtml(o.Status || 'Pending')}</span></td>
                        <td><button class="btn-icon" onclick="viewOrder('${escapeHtml(o.Order_ID)}')"><i class="fas fa-eye"></i></button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderPendingPaymentsList() {
    const container = document.getElementById('pending-payments');
    if (!container) return;
    
    const pending = allData.payments.filter(p => 
        !p.Status || p.Status.toLowerCase().includes('pending')
    ).slice(0, 5);
    
    if (pending.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No pending payments</p></div>';
        return;
    }
    
    container.innerHTML = pending.map(p => `
        <div class="pending-item">
            <div class="pending-info">
                <strong>${escapeHtml(p.Customer_Name || p.Name || '-')}</strong>
                <span>₹${formatNumber(p.Advance_Paid || p.Amount)}</span>
            </div>
            <div class="pending-actions">
                <button class="btn-icon success" onclick="approvePayment('${escapeHtml(p.Phone)}')" title="Approve">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-icon danger" onclick="rejectPayment('${escapeHtml(p.Phone)}')" title="Reject">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// ==========================================
// PRODUCTS
// ==========================================

function openProductModal(serialNo = null) {
    const isEdit = serialNo !== null;
    const product = isEdit ? allData.products.find(p => {
        const serial = getField(p, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
        return serial === serialNo;
    }) : {};
    
    document.getElementById('product-modal-title').innerHTML = `<i class="fas fa-box"></i> ${isEdit ? 'Edit' : 'Add'} Product`;
    document.getElementById('product-edit-serial').value = isEdit ? serialNo : '';
    
    document.getElementById('product-serial').value = getField(product, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
    document.getElementById('product-serial').readOnly = isEdit;
    document.getElementById('product-name').value = getField(product, 
        'Saree_Name', 'Product_Name', 'Name', 'Product Name', 'Saree Name',
        'Item_Name', 'Item Name', 'Product', 'saree_name', 'product_name',
        'name', 'item_name'
    ) || '';
    document.getElementById('product-category').value = getField(product, 'Category', 'category') || 'Silk';
    document.getElementById('product-price').value = getField(product, 'Price', 'price') || '';
    document.getElementById('product-color').value = getField(product, 'Color', 'color') || '';
    document.getElementById('product-fabric').value = getField(product, 'Fabric', 'fabric') || '';
    document.getElementById('product-stock').value = getField(product, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty') || '10';
    document.getElementById('product-image').value = getField(product, 'Image_URL', 'image_url', 'ImageURL', 'Image URL') || '';
    
    const preview = document.getElementById('product-image-preview');
    const imgUrl = convertDriveLink(product?.Image_URL || product?.image_url || '');
    preview.innerHTML = imgUrl ? `<img src="${imgUrl}" alt="Preview">` : '';
    
    openModal('product-modal');
}

async function saveProduct() {
    const isEdit = document.getElementById('product-edit-serial').value !== '';
    
    const data = {
        Serial_No: document.getElementById('product-serial').value.trim(),
        Saree_Name: document.getElementById('product-name').value.trim(),
        Category: document.getElementById('product-category').value,
        Price: document.getElementById('product-price').value.trim(),
        Color: document.getElementById('product-color').value.trim(),
        Fabric: document.getElementById('product-fabric').value.trim(),
        Stock_Qty: document.getElementById('product-stock').value.trim(),
        Image_URL: document.getElementById('product-image').value.trim()
    };
    
    if (!data.Serial_No || !data.Saree_Name || !data.Price) {
        return showToast('Serial, Name aur Price required hai!', 'error');
    }
    
    const qty = parseInt(data.Stock_Qty) || 0;
    data.Stock_Status = qty === 0 ? 'Out of Stock' : qty <= 5 ? 'Low Stock' : 'In Stock';
    
    try {
        showLoading(true, 'Saving...');
        await postToWebhook(isEdit ? API.updateProduct : API.addProduct, data);
        closeModal('product-modal');
        await loadAllData();
        showToast(`Product ${isEdit ? 'updated' : 'added'}!`, 'success');
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteProduct(serialNo) {
    if (!confirm('Product delete karna hai?')) return;
    
    try {
        showLoading(true, 'Deleting...');
        await postToWebhook(API.deleteProduct, { Serial_No: serialNo });
        await loadAllData();
        showToast('Product deleted!', 'success');
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// ORDERS
// ==========================================

function renderOrders() {
    const container = document.getElementById('orders-table');
    if (!container) return;
    
    const search = document.getElementById('order-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('order-status-filter')?.value || 'all';
    
    let orders = [...allData.orders].sort((a, b) => 
        new Date(b.Order_Date || b.Timestamp) - new Date(a.Order_Date || a.Timestamp)
    );
    
    if (statusFilter !== 'all') {
        orders = orders.filter(o => o.Status?.toLowerCase() === statusFilter.toLowerCase());
    }
    
    if (search) {
        orders = orders.filter(o =>
            (o.Order_ID || '').toLowerCase().includes(search) ||
            (o.Customer_Name || '').toLowerCase().includes(search) ||
            (o.Phone || '').includes(search)
        );
    }
    
    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-cart"></i><h3>No orders found</h3></div>';
        return;
    }
    
    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Order ID</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${orders.map(o => `
                    <tr>
                        <td><strong>${escapeHtml(o.Order_ID || '-')}</strong></td>
                        <td>${formatDate(o.Order_Date || o.Timestamp)}</td>
                        <td>
                            <div>${escapeHtml(o.Customer_Name || '-')}</div>
                            <small style="color:var(--gray-500)">${escapeHtml(o.Phone || '')}</small>
                        </td>
                        <td>${escapeHtml((o.Product_Name || o.Serial_No || '-').substring(0, 20))}</td>
                        <td><strong>₹${formatNumber(o.Amount)}</strong></td>
                        <td><span class="status-badge ${getStatusClass(o.Status)}">${escapeHtml(o.Status || 'Pending')}</span></td>
                        <td>
                            <div class="action-btns">
                                <button class="btn-icon" onclick="viewOrder('${escapeHtml(o.Order_ID)}')" title="View">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn-icon whatsapp" onclick="openWhatsApp('${escapeHtml(o.Phone)}')" title="WhatsApp">
                                    <i class="fab fa-whatsapp"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function viewOrder(orderId) {
    const order = allData.orders.find(o => o.Order_ID === orderId);
    if (!order) return showToast('Order not found!', 'error');
    
    const product = allData.products.find(p => p.Serial_No === order.Serial_No);
    const productImage = convertDriveLink(product?.Image_URL || order.Product_Image || '');
    
    const modalBody = document.getElementById('order-modal-body');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
        <div class="order-detail">
            <div class="order-header">
                <h3>#${escapeHtml(order.Order_ID)}</h3>
                <span class="status-badge large ${getStatusClass(order.Status)}">${escapeHtml(order.Status || 'Pending')}</span>
            </div>
            
            <div class="detail-grid">
                <div class="detail-section">
                    <h4><i class="fas fa-user"></i> Customer</h4>
                    <p><strong>Name:</strong> ${escapeHtml(order.Customer_Name || '-')}</p>
                    <p><strong>Phone:</strong> <a href="tel:${order.Phone}">${escapeHtml(order.Phone || '-')}</a></p>
                    <p><strong>Address:</strong> ${escapeHtml(order.Delivery_Address || order.Address || '-')}</p>
                </div>
                
                <div class="detail-section">
                    <h4><i class="fas fa-box"></i> Product</h4>
                    ${productImage ? `<img src="${productImage}" alt="Product" class="product-thumb">` : ''}
                    <p><strong>Name:</strong> ${escapeHtml(order.Product_Name || '-')}</p>
                    <p><strong>Serial:</strong> ${escapeHtml(order.Serial_No || '-')}</p>
                    <p><strong>Amount:</strong> ₹${formatNumber(order.Amount)}</p>
                </div>
                
                <div class="detail-section">
                    <h4><i class="fas fa-credit-card"></i> Payment</h4>
                    <p><strong>Type:</strong> ${escapeHtml(order.Payment_Type || '-')}</p>
                    <p><strong>Status:</strong> ${escapeHtml(order.Payment_Status || '-')}</p>
                    ${order.Advance_Paid ? `<p><strong>Advance:</strong> ₹${formatNumber(order.Advance_Paid)}</p>` : ''}
                    ${order.Balance_Due ? `<p><strong>Balance:</strong> ₹${formatNumber(order.Balance_Due)}</p>` : ''}
                </div>
                
                <div class="detail-section">
                    <h4><i class="fas fa-truck"></i> Tracking</h4>
                    ${order.Tracking_ID ? `
                        <p><strong>ID:</strong> ${escapeHtml(order.Tracking_ID)}</p>
                        <p><strong>Courier:</strong> ${escapeHtml(order.Courier || order.Tracking_Courier || '-')}</p>
                        ${order.Tracking_URL ? `<a href="${order.Tracking_URL}" target="_blank" class="btn btn-sm btn-outline">Track</a>` : ''}
                    ` : '<p>No tracking yet</p>'}
                </div>
            </div>
            
            <div class="order-update-section">
                <h4><i class="fas fa-edit"></i> Update Order</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>Status *</label>
                        <select id="update-order-status">
                            <option value="Pending" ${order.Status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Confirmed" ${order.Status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                            <option value="Shipped" ${order.Status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="Out for Delivery" ${order.Status === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
                            <option value="Delivered" ${order.Status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                            <option value="Cancelled" ${order.Status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tracking ID</label>
                        <input type="text" id="update-tracking-id" value="${escapeHtml(order.Tracking_ID || '')}" placeholder="AWB123456">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Courier</label>
                        <select id="update-courier">
                            <option value="">Select</option>
                            <option value="BlueDart" ${order.Courier === 'BlueDart' ? 'selected' : ''}>BlueDart</option>
                            <option value="Delhivery" ${order.Courier === 'Delhivery' ? 'selected' : ''}>Delhivery</option>
                            <option value="DTDC" ${order.Courier === 'DTDC' ? 'selected' : ''}>DTDC</option>
                            <option value="India Post" ${order.Courier === 'India Post' ? 'selected' : ''}>India Post</option>
                            <option value="Ekart" ${order.Courier === 'Ekart' ? 'selected' : ''}>Ekart</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tracking URL</label>
                        <input type="url" id="update-tracking-url" value="${escapeHtml(order.Tracking_URL || '')}" placeholder="https://...">
                    </div>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="notify-customer" checked> 
                        Customer ko WhatsApp notify karo
                    </label>
                </div>
                <button class="btn btn-primary btn-block" onclick="updateOrderStatus('${escapeHtml(order.Order_ID)}')">
                    <i class="fas fa-save"></i> Update Order
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('order-modal').dataset.orderId = orderId;
    openModal('order-modal');
}

async function updateOrderStatus(orderId) {
    const order = allData.orders.find(o => o.Order_ID === orderId);
    if (!order) return showToast('Order not found!', 'error');
    
    const newStatus = document.getElementById('update-order-status').value;
    const trackingId = document.getElementById('update-tracking-id').value.trim();
    const courier = document.getElementById('update-courier').value;
    const trackingUrl = document.getElementById('update-tracking-url').value.trim();
    const notifyCustomer = document.getElementById('notify-customer').checked;
    
    const previousStatus = order.Status;
    const statusChanged = newStatus !== previousStatus;
    const trackingAdded = trackingId && !order.Tracking_ID;
    const trackingUpdated = trackingId && order.Tracking_ID && trackingId !== order.Tracking_ID;
    
    try {
        showLoading(true, 'Updating order...');
        
        const updateData = {
            Order_ID: orderId,
            Status: newStatus,
            Previous_Status: previousStatus,
            Tracking_ID: trackingId,
            Tracking_URL: trackingUrl,
            Tracking_Courier: courier,
            
            // Customer info for WhatsApp
            Phone: order.Phone,
            Customer_Name: order.Customer_Name,
            Product_Name: order.Product_Name || order.Serial_No,
            Serial_No: order.Serial_No,
            Amount: order.Amount,
            Balance_Due: order.Balance_Due,
            
            // Flags
            send_whatsapp: notifyCustomer,
            status_changed: statusChanged,
            tracking_added: trackingAdded,
            
            // Dates
            Confirmed_Date: newStatus === 'Confirmed' && previousStatus !== 'Confirmed' ? new Date().toISOString() : '',
            Dispatched_Date: newStatus === 'Shipped' && previousStatus !== 'Shipped' ? new Date().toISOString() : '',
            Delivered_Date: newStatus === 'Delivered' && previousStatus !== 'Delivered' ? new Date().toISOString() : '',
            Payment_Status: newStatus === 'Delivered' ? 'Paid' : ''
        };
        
        await postToWebhook(API.updateOrder, updateData);
        
        // Send WhatsApp message directly if customer notification is enabled
        if (notifyCustomer && order.Phone && (statusChanged || trackingAdded || trackingUpdated)) {
            let whatsappMessage = '';
            const customerName = order.Customer_Name || 'Customer';
            const productName = order.Product_Name || order.Serial_No || 'Product';
            
            // Build message based on what changed
            if (statusChanged && (trackingAdded || trackingUpdated)) {
                // Both status and tracking changed
                whatsappMessage = `Namaste ${customerName} ji! 🙏\n\n`;
                whatsappMessage += `Aapka order #${orderId} ka status update ho gaya hai:\n`;
                whatsappMessage += `📦 Status: *${newStatus}*\n\n`;
                
                if (trackingId) {
                    whatsappMessage += `📮 Tracking Details:\n`;
                    whatsappMessage += `Tracking ID: *${trackingId}*\n`;
                    if (courier) {
                        whatsappMessage += `Courier: ${courier}\n`;
                    }
                    if (trackingUrl) {
                        whatsappMessage += `Track here: ${trackingUrl}\n`;
                    }
                    whatsappMessage += `\n`;
                }
                
                whatsappMessage += `Product: ${productName}\n`;
                whatsappMessage += `Amount: ₹${formatNumber(order.Amount)}\n\n`;
                whatsappMessage += `Dhanyawad! 🙏\nMamta Saree`;
                
            } else if (statusChanged) {
                // Only status changed
                const statusMessages = {
                    'Confirmed': 'Aapka order confirm ho gaya hai! 🎉',
                    'Shipped': 'Aapka order ship ho gaya hai! 📦',
                    'Out for Delivery': 'Aapka order delivery ke liye ready hai! 🚚',
                    'Delivered': 'Aapka order deliver ho gaya hai! ✅',
                    'Cancelled': 'Aapka order cancel ho gaya hai. Koi problem ho toh contact karein.'
                };
                
                whatsappMessage = `Namaste ${customerName} ji! 🙏\n\n`;
                whatsappMessage += `${statusMessages[newStatus] || `Aapka order status update: ${newStatus}`}\n\n`;
                whatsappMessage += `Order ID: #${orderId}\n`;
                whatsappMessage += `Product: ${productName}\n`;
                whatsappMessage += `Amount: ₹${formatNumber(order.Amount)}\n\n`;
                whatsappMessage += `Dhanyawad! 🙏\nMamta Saree`;
                
            } else if (trackingAdded || trackingUpdated) {
                // Only tracking added/updated
                whatsappMessage = `Namaste ${customerName} ji! 🙏\n\n`;
                whatsappMessage += `Aapka order #${orderId} ka tracking details:\n\n`;
                
                if (trackingId) {
                    whatsappMessage += `📮 Tracking ID: *${trackingId}*\n`;
                    if (courier) {
                        whatsappMessage += `Courier: ${courier}\n`;
                    }
                    if (trackingUrl) {
                        whatsappMessage += `\nTrack your order here:\n${trackingUrl}\n`;
                    } else {
                        whatsappMessage += `\nTracking link jald hi share karenge.\n`;
                    }
                }
                
                whatsappMessage += `\nProduct: ${productName}\n`;
                whatsappMessage += `Amount: ₹${formatNumber(order.Amount)}\n\n`;
                whatsappMessage += `Dhanyawad! 🙏\nMamta Saree`;
            }
            
            // Send WhatsApp message
            if (whatsappMessage) {
                try {
                    await sendWhatsAppViaN8N(order.Phone, whatsappMessage, customerName);
                    console.log('✅ WhatsApp sent to customer:', order.Phone);
                } catch (whatsappError) {
                    console.error('WhatsApp send error:', whatsappError);
                    // Don't fail the whole update if WhatsApp fails
                    showToast('⚠️ Order updated but WhatsApp failed', 'warning');
                }
            }
        }
        
        closeModal('order-modal');
        await loadAllData();
        
        if (notifyCustomer && (statusChanged || trackingAdded || trackingUpdated)) {
            showToast('✅ Order updated & customer ko WhatsApp bheja!', 'success');
        } else {
            showToast('✅ Order updated!', 'success');
        }
        
    } catch (error) {
        console.error('Update order error:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// PAYMENTS
// ==========================================

function renderPayments() {
    const container = document.getElementById('payments-table');
    if (!container) return;

    const search = document.getElementById('payment-search')?.value.toLowerCase() || '';

    let payments = [...allData.payments].sort((a, b) =>
        new Date(b.Timestamp || b.Payment_Date) - new Date(a.Timestamp || a.Payment_Date)
    );

    if (search) {
        payments = payments.filter(p =>
            (p.Customer_Name || p.Name || '').toLowerCase().includes(search) ||
            (p.Phone || '').includes(search) ||
            (p.Order_ID || '').toLowerCase().includes(search) ||
            (p.Product_Name || '').toLowerCase().includes(search)
        );
    }

    if (payments.length === 0) {
        container.innerHTML =
            '<div class="empty-state"><i class="fas fa-credit-card"></i><h3>No payments found</h3></div>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Advance</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${payments.map(p => {
                    const isPending = !p.Status || p.Status.toLowerCase().includes('pending');
                    const screenshotUrl = p.Screenshot_URL
                        ? convertDriveLink(p.Screenshot_URL)
                        : null;

                    return `
                        <tr class="${isPending ? 'pending-row' : ''}">
                            <td>${formatDate(p.Timestamp || p.Payment_Date)}</td>
                            <td><strong>${escapeHtml(p.Order_ID || '-')}</strong></td>
                            <td>${escapeHtml(p.Customer_Name || p.Name || '-')}</td>
                            <td><a href="tel:${p.Phone}">${escapeHtml(p.Phone || '-')}</a></td>
                            <td>${escapeHtml(p.Product_Name || p.Product || '-')}</td>
                            <td>${escapeHtml(p.Payment_Type || '-')}</td>
                            <td>₹${formatNumber(p.Amount_Expected || p.Amount || p.Total_Amount || 0)}</td>
                            <td class="text-success">₹${formatNumber(p.Advance_Paid || 0)}</td>
                            <td class="${parseFloat(p.Balance_Due) > 0 ? 'text-danger' : ''}">
                                ₹${formatNumber(p.Balance_Due || 0)}
                            </td>
                            <td>
                                <span class="status-badge ${getStatusClass(p.Status)}">
                                    ${escapeHtml(p.Status || 'Pending')}
                                </span>
                            </td>
                            <td>
                                <div class="action-btns">
                                    ${isPending ? `
                                        <button class="btn-icon success"
                                            onclick="approvePayment('${escapeHtml(p.Phone)}')"
                                            title="Approve">
                                            <i class="fas fa-check"></i>
                                        </button>
                                        <button class="btn-icon danger"
                                            onclick="rejectPayment('${escapeHtml(p.Phone)}')"
                                            title="Reject">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    ` : ''}

                                    ${screenshotUrl ? `
                                        <button class="btn-icon"
                                            onclick="viewScreenshot('${escapeHtml(screenshotUrl)}')"
                                            title="Screenshot">
                                            <i class="fas fa-image"></i>
                                        </button>
                                    ` : ''}

                                    <button class="btn-icon whatsapp"
                                        onclick="openWhatsApp('${escapeHtml(p.Phone)}')"
                                        title="WhatsApp">
                                        <i class="fab fa-whatsapp"></i>
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


function viewScreenshot(url) {
    if (!url) return;
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'screenshot-modal';
    modal.onclick = function(e) { if (e.target === this) this.remove(); };
    modal.innerHTML = `
        <div class="modal-content" style="max-width:90vw; background:transparent; box-shadow:none;">
            <button class="modal-close" onclick="document.getElementById('screenshot-modal')?.remove()">&times;</button>
            <img src="${url}" alt="Screenshot" style="max-width:100%; max-height:85vh; border-radius:12px;">
        </div>
    `;
    document.body.appendChild(modal);
}

// ✅ APPROVE PAYMENT - Clean Version
// ===============================
// APPROVE PAYMENT - WITH TIMESTAMP
// ===============================
async function approvePayment(phone) {
    const payment = allData.payments.find(p => p.Phone === phone && p.Status.includes('Pending'));
    if (!payment) return showToast('Pending payment not found!', 'error');
    
    if (!confirm(`${payment.Customer_Name} ji ka payment APPROVE karna hai?`)) return;
    
    try {
        showLoading(true, 'Approving...');
        
        await postToWebhook(API.approvePayment, {
            Phone: phone,
            Timestamp: payment.Timestamp,           // ← YEH LINE ADD KI HAI
            Customer_Name: payment.Customer_Name,
            Amount: payment.Advance_Paid || payment.Amount,
            Serial_No: payment.Serial_No || '',
            Order_ID: payment.Order_ID || ''
        });
        
        // 3 second wait – sheet update hone ka time
        await new Promise(resolve => setTimeout(resolve, 3000));
        await loadAllData();
        
        showToast('Payment Approved Successfully!', 'success');
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function rejectPayment(phone) {
    const payment = allData.payments.find(
        p => p.Phone === phone && p.Status && p.Status.toLowerCase().includes('pending')
    );
    
    if (!payment) {
        return showToast('Pending payment not found!', 'error');
    }

    const reason =
        prompt('Rejection reason:', 'Screenshot clear nahi tha') ||
        'Screenshot clear nahi tha';

    if (!confirm(`${payment.Customer_Name} ji ka payment REJECT karna hai?\nReason: ${reason}`)) {
        return;
    }

    try {
        showLoading(true, 'Rejecting...');

        await postToWebhook(API.rejectPayment, {
            Phone: phone,
            Timestamp: payment.Timestamp,            // ✅ SAME AS APPROVE
            Customer_Name: payment.Customer_Name,
            Amount: payment.Advance_Paid || payment.Amount,
            Serial_No: payment.Serial_No || '',
            Order_ID: payment.Order_ID || '',
            Rejection_Reason: reason,                 // ✅ EXTRA FIELD
            Status: 'Rejected'
        });

        // Sheet update hone ka wait
        await new Promise(resolve => setTimeout(resolve, 3000));
        await loadAllData();

        showToast('Payment Rejected Successfully!', 'warning');
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}


// ==========================================
// CUSTOMERS
// ==========================================

function renderCustomers() {
    const container = document.getElementById('customers-table');
    if (!container) return;
    
    console.log('👥 Rendering customers, total:', allData.customers.length);
    if (allData.customers.length > 0) {
        console.log('👥 ✅ Customers found for rendering!');
        console.log('👥 Sample customer:', allData.customers[0]);
        console.log('👥 Customer keys:', Object.keys(allData.customers[0]));
        console.log('👥 Full customer data:', JSON.stringify(allData.customers.slice(0, 2), null, 2));
    } else {
        console.warn('⚠️ No customers to render!');
        // Try to reload customers from orders one more time
        if (allData.orders.length > 0) {
            console.log('💡 Last attempt: Deriving customers from orders...');
            const uniqueCustomers = {};
            allData.orders.forEach(order => {
                const phone = (order.Phone || '').toString().trim();
                if (phone && phone.length >= 10) {
                    const normalizedPhone = phone.replace(/[^0-9]/g, '');
                    if (normalizedPhone.length >= 10 && !uniqueCustomers[normalizedPhone]) {
                        uniqueCustomers[normalizedPhone] = {
                            Customer_Name: getField(order, 'Customer_Name', 'Name', 'Customer Name', 'customer_name', 'name') || 'Unknown Customer',
                            Phone: phone,
                            Email: getField(order, 'Email', 'email') || '',
                            Address: getField(order, 'Delivery_Address', 'Address', 'Delivery Address', 'address', 'delivery_address') || ''
                        };
                    }
                }
            });
            if (Object.keys(uniqueCustomers).length > 0) {
                allData.customers = Object.values(uniqueCustomers);
                console.log(`✅ Derived ${allData.customers.length} customers from orders`);
            }
        }
    }
    
    const search = document.getElementById('customer-search')?.value.toLowerCase() || '';
    
    let customers = [...allData.customers];
    
    if (search) {
        customers = customers.filter(c => {
            // Try Name field first (as it's in Customers sheet), then Customer_Name
            const name = getField(c, 'Name', 'Customer_Name', 'Customer Name', 'customer_name', 'name', 'First_Contact', 'First Contact') || '';
            const phone = (c.Phone || '').toString();
            return name.toLowerCase().includes(search) || phone.includes(search);
        });
    }
    
    if (customers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>No customers found</h3>
                <p>${allData.customers.length === 0 ? 
                    'Customers sheet mein data check karo. Agar Customers sheet empty hai, toh customers orders se automatically derive ho jayenge.' : 
                    'Try different search'}</p>
                ${allData.orders.length > 0 ? `<p style="margin-top: 10px; color: var(--gray-500); font-size: 14px;">
                    <i class="fas fa-info-circle"></i> ${allData.orders.length} orders found. Customers should be derived from orders.
                </p>` : ''}
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
                    <th>Email</th>
                    <th>Address</th>
                    <th>Orders</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${customers.map(c => {
                    // Try multiple field name variations - prioritize Name from Customers sheet
                    const customerName = getField(c, 'Name', 'Customer_Name', 'Customer Name', 'customer_name', 'name', 'First_Contact', 'First Contact') || 'Unknown Customer';
                    const phone = (c.Phone || '').toString().trim() || '-';
                    const email = getField(c, 'Email', 'email') || '-';
                    const address = getField(c, 'Address', 'Delivery_Address', 'Delivery Address', 'address', 'delivery_address') || '-';
                    
                    // Count orders by matching phone numbers (normalized)
                    const customerPhoneNormalized = phone.replace(/[^0-9]/g, '');
                    const orderCount = allData.orders.filter(o => {
                        const orderPhone = (o.Phone || '').toString().replace(/[^0-9]/g, '');
                        return orderPhone && customerPhoneNormalized && orderPhone === customerPhoneNormalized;
                    }).length;
                    
                    return `
                        <tr>
                            <td><strong>${escapeHtml(customerName)}</strong></td>
                            <td><a href="tel:${phone}">${escapeHtml(phone)}</a></td>
                            <td>${escapeHtml(email)}</td>
                            <td>${escapeHtml(address.substring(0, 30))}${address.length > 30 ? '...' : ''}</td>
                            <td><span class="status-badge">${orderCount}</span></td>
                            <td>
                                <div class="action-btns">
                                    ${phone !== '-' ? `
                                        <button class="btn-icon whatsapp" onclick="openWhatsApp('${escapeHtml(phone)}')" title="WhatsApp">
                                            <i class="fab fa-whatsapp"></i>
                                        </button>
                                        <button class="btn-icon" onclick="window.location.href='tel:${escapeHtml(phone)}'" title="Call">
                                            <i class="fas fa-phone"></i>
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
// LEADS
// ==========================================

function renderLeads() {
    const container = document.getElementById('leads-table');
    if (!container) return;
    
    const search = document.getElementById('lead-search')?.value.toLowerCase() || '';
    
    let leads = [...allData.leads].sort((a, b) => {
        const aDate = a.Followup_Date ? new Date(a.Followup_Date) : new Date('2099-12-31');
        const bDate = b.Followup_Date ? new Date(b.Followup_Date) : new Date('2099-12-31');
        if (aDate.getTime() !== bDate.getTime()) return aDate - bDate;
        const statusOrder = { 'Hot': 1, 'Warm': 2, 'Cold': 3 };
        return (statusOrder[a.Status] || 4) - (statusOrder[b.Status] || 4);
    });
    
    if (currentLeadFilter !== 'all') {
        leads = leads.filter(l => l.Status?.toLowerCase() === currentLeadFilter.toLowerCase());
    }
    
    if (search) {
        leads = leads.filter(l =>
            (l.Name || '').toLowerCase().includes(search) ||
            (l.Phone || '').includes(search)
        );
    }
    
    if (leads.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-fire"></i>
                <h3>No leads found</h3>
                <button class="btn btn-primary" onclick="openLeadModal()">
                    <i class="fas fa-plus"></i> Add Lead
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="leads-grid">
            ${leads.map(l => {
                const statusClass = l.Status?.toLowerCase() || 'cold';
                const statusEmoji = l.Status === 'Hot' ? '🔥' : l.Status === 'Warm' ? '🌡️' : '❄️';
                
                const followupDate = l.Followup_Date ? new Date(l.Followup_Date) : null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isOverdue = followupDate && followupDate < today;
                const isDueToday = followupDate && followupDate.toDateString() === today.toDateString();
                
                return `
                    <div class="lead-card ${statusClass}">
                        <div class="lead-header">
                            <div class="lead-info">
                                <h4>${escapeHtml(l.Name || '-')}</h4>
                                <p><i class="fas fa-phone"></i> ${escapeHtml(l.Phone || '-')}</p>
                            </div>
                            <span class="status-badge ${statusClass}">${statusEmoji} ${escapeHtml(l.Status || 'Cold')}</span>
                        </div>
                        
                        <div class="lead-body">
                            ${l.Product_Interest ? `
                                <div class="lead-detail">
                                    <i class="fas fa-box"></i>
                                    <span>${escapeHtml(l.Product_Interest)}</span>
                                </div>
                            ` : ''}
                            
                            <div class="lead-detail">
                                <i class="fas fa-tag"></i>
                                <span>Source: ${escapeHtml(l.Source || '-')}</span>
                            </div>
                            
                            ${l.Notes ? `
                                <div class="lead-notes">
                                    <i class="fas fa-sticky-note"></i> ${escapeHtml(l.Notes)}
                                </div>
                            ` : ''}
                        </div>
                        
                        ${followupDate ? `
                            <div class="lead-followup ${isOverdue ? 'overdue' : ''}">
                                <i class="fas fa-calendar-alt"></i>
                                <span>
                                    ${isOverdue ? '⚠️ Overdue: ' : isDueToday ? '📅 Today: ' : 'Followup: '}
                                    ${formatDate(l.Followup_Date)}
                                </span>
                            </div>
                        ` : ''}
                        
                        <div class="lead-actions">
                            <button class="btn btn-sm btn-success" onclick="openFollowupModal('${escapeHtml(l.Phone)}', '${escapeHtml(l.Name)}')">
                                <i class="fab fa-whatsapp"></i> Followup
                            </button>
                            <button class="btn btn-sm btn-outline" onclick="openLeadModal('${escapeHtml(l.Phone)}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn-icon whatsapp" onclick="openWhatsApp('${escapeHtml(l.Phone)}')">
                                <i class="fab fa-whatsapp"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function openLeadModal(phone = null) {
    const isEdit = phone !== null;
    const lead = isEdit ? allData.leads.find(l => l.Phone === phone) : {};
    
    document.getElementById('lead-modal-title').innerHTML = `<i class="fas fa-fire"></i> ${isEdit ? 'Edit' : 'Add'} Lead`;
    document.getElementById('lead-edit-phone').value = isEdit ? phone : '';
    
    document.getElementById('lead-name').value = lead?.Name || '';
    document.getElementById('lead-phone').value = lead?.Phone || '';
    document.getElementById('lead-phone').readOnly = isEdit;
    document.getElementById('lead-status').value = lead?.Status || 'Warm';
    document.getElementById('lead-source').value = lead?.Source || 'WhatsApp';
    document.getElementById('lead-product').value = lead?.Product_Interest || '';
    document.getElementById('lead-followup-date').value = lead?.Followup_Date || '';
    document.getElementById('lead-followup-time').value = lead?.Followup_Time || '10:00';
    document.getElementById('lead-notes').value = lead?.Notes || '';
    
    openModal('lead-modal');
}

async function saveLead() {
    const isEdit = document.getElementById('lead-edit-phone').value !== '';
    
    const data = {
        Name: document.getElementById('lead-name').value.trim(),
        Phone: document.getElementById('lead-phone').value.trim(),
        Status: document.getElementById('lead-status').value,
        Source: document.getElementById('lead-source').value,
        Product_Interest: document.getElementById('lead-product').value.trim(),
        Followup_Date: document.getElementById('lead-followup-date').value,
        Followup_Time: document.getElementById('lead-followup-time').value,
        Notes: document.getElementById('lead-notes').value.trim()
    };
    
    if (!data.Name || !data.Phone) {
        return showToast('Name aur Phone required hai!', 'error');
    }
    
    try {
        showLoading(true, 'Saving lead...');
        await postToWebhook(isEdit ? API.updateLead : API.addLead, data);
        closeModal('lead-modal');
        await loadAllData();
        showToast(`Lead ${isEdit ? 'updated' : 'added'}!`, 'success');
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function openFollowupModal(phone, name) {
    document.getElementById('followup-phone').value = phone;
    document.getElementById('followup-name').value = name;
    document.getElementById('followup-template').value = 'reminder';
    updateFollowupMessage();
    openModal('followup-modal');
}

function updateFollowupMessage() {
    const template = document.getElementById('followup-template').value;
    const name = document.getElementById('followup-name').value;
    const lead = allData.leads.find(l => l.Phone === document.getElementById('followup-phone').value);
    const product = lead?.Product_Interest || 'saree';
    
    let message = '';
    
    switch (template) {
        case 'reminder':
            message = `Namaste ${name} ji! 🙏

Aapne humare ${product} mein interest dikhaya tha.

Kya aap order karna chahenge? 😊

Reply karein ya call karein:
📞 ${CONFIG.BUSINESS_PHONE}

Mamta Saree`;
            break;
            
        case 'discount':
            message = `🎁 *Special Discount!*

Namaste ${name} ji! 🙏

Aapke liye 10% OFF hai ${product} pe!

Jaldi order karein!

📞 ${CONFIG.BUSINESS_PHONE}
Mamta Saree`;
            break;
            
        case 'newstock':
            message = `✨ *New Collection!*

Namaste ${name} ji! 🙏

Nayi collection aa gayi hai!

Dekhne ke liye "SHOW" reply karein

📞 ${CONFIG.BUSINESS_PHONE}
Mamta Saree`;
            break;
            
        case 'custom':
            message = `Namaste ${name} ji! 🙏

[Apna message likhen]

📞 ${CONFIG.BUSINESS_PHONE}
Mamta Saree`;
            break;
    }
    
    document.getElementById('followup-message').value = message;
}

async function sendFollowupMessage() {
    const phone = document.getElementById('followup-phone').value;
    const name = document.getElementById('followup-name').value;
    const message = document.getElementById('followup-message').value;
    
    if (!message.trim()) {
        return showToast('Message likhna zaroori hai!', 'error');
    }
    
    try {
        showLoading(true, 'Sending...');
        
        const success = await sendWhatsAppViaN8N(phone, message, name);
        
        if (success) {
            // Update lead's last contacted date
            await postToWebhook(API.updateLead, {
                Phone: phone,
                Last_Contacted: new Date().toISOString()
            });
            
            closeModal('followup-modal');
            showToast('✅ Followup sent!', 'success');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// TAB SWITCHING & EVENT LISTENERS
// ==========================================

function switchTab(tab) {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tab}-tab`);
    });
    
    const titles = {
        'dashboard': 'Dashboard',
        'products': 'Products',
        'orders': 'Orders',
        'payments': 'Payments',
        'customers': 'Customers',
        'leads': 'Leads'
    };
    
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = titles[tab] || 'Dashboard';
    
    if (window.innerWidth <= 992) {
        document.getElementById('sidebar')?.classList.remove('active');
    }
}

function setupEventListeners() {
    // Sidebar toggle
    document.getElementById('toggle-sidebar')?.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth <= 992) {
            sidebar?.classList.toggle('active');
        } else {
            sidebar?.classList.toggle('collapsed');
        }
    });
    
    // Menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });
    
    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
        const icon = document.querySelector('#refresh-btn i');
        if (icon) icon.classList.add('fa-spin');
        loadAllData().finally(() => {
            if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 500);
        });
    });
    
    // Search inputs with debounce
    const searchInputs = [
        { id: 'product-search', render: renderProducts },
        { id: 'order-search', render: renderOrders },
        { id: 'payment-search', render: renderPayments },
        { id: 'customer-search', render: renderCustomers },
        { id: 'lead-search', render: renderLeads }
    ];
    
    searchInputs.forEach(({ id, render }) => {
        const el = document.getElementById(id);
        if (el) {
            let timeout;
            el.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(render, 300);
            });
        }
    });
    
    // Order status filter
    document.getElementById('order-status-filter')?.addEventListener('change', renderOrders);
    
    // Lead filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLeadFilter = btn.dataset.filter;
            renderLeads();
        });
    });
    
    // Product image preview
    document.getElementById('product-image')?.addEventListener('input', (e) => {
        const preview = document.getElementById('product-image-preview');
        const url = convertDriveLink(e.target.value);
        if (preview) {
            preview.innerHTML = url ? `<img src="${url}" alt="Preview">` : '';
        }
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
    
    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
        }
    });
}

// ==========================================
// AUTO REFRESH
// ==========================================

let autoRefreshInterval = null;

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    
    autoRefreshInterval = setInterval(() => {
        if (!document.hidden) {
            console.log('🔄 Auto refresh...');
            loadAllData(true);
        }
    }, CONFIG.AUTO_REFRESH_INTERVAL);
}





// ==========================================
// PRODUCTS WITH COLOR VARIANTS
// ==========================================

// Get base serial number (removes color suffix)
function getBaseSerial(serialNo) {
    if (!serialNo) return '';
    // Pattern: "S NO 2-R" → "S NO 2"
    const match = serialNo.match(/^(.+?)(?:-[A-Za-z0-9]+)?$/);
    return match ? match[1].trim() : serialNo;
}

// Check if serial has color code
function hasColorCode(serialNo) {
    if (!serialNo) return false;
    return /-[A-Za-z0-9]+$/.test(serialNo);
}

// Get color code from serial
function getColorCode(serialNo) {
    if (!serialNo) return '';
    const match = serialNo.match(/-([A-Za-z0-9]+)$/);
    return match ? match[1] : '';
}

// Color name to hex
function getColorHex(colorName) {
    if (!colorName) return '#999999';
    
    const colors = {
        'red': '#e74c3c',
        'blue': '#3498db',
        'green': '#27ae60',
        'yellow': '#f1c40f',
        'orange': '#e67e22',
        'purple': '#9b59b6',
        'pink': '#e91e63',
        'black': '#2c3e50',
        'white': '#ecf0f1',
        'grey': '#95a5a6',
        'gray': '#95a5a6',
        'maroon': '#800000',
        'navy': '#001f3f',
        'gold': '#ffd700',
        'silver': '#c0c0c0',
        'cream': '#fffdd0',
        'beige': '#f5f5dc',
        'brown': '#8b4513',
        'magenta': '#ff00ff',
        'cyan': '#00bcd4',
        'teal': '#008080',
        'lavender': '#e6e6fa',
        'coral': '#ff7f50',
        'peach': '#ffcba4',
        'mint': '#98ff98',
        'olive': '#808000',
        'wine': '#722f37',
        'rust': '#b7410e',
        'mustard': '#ffdb58',
        'turquoise': '#40e0d0',
        'rani': '#e91e63',
        'firozi': '#40e0d0',
        'mehendi': '#808000',
        'gulabi': '#ff69b4',
        'neela': '#0000ff',
        'hara': '#008000',
        'peela': '#ffff00',
        'kala': '#000000',
        'safed': '#ffffff',
        'lal': '#ff0000'
    };
    
    const lowerColor = colorName.toLowerCase().trim();
    return colors[lowerColor] || generateColorFromString(colorName);
}

// Generate color from string for unknown colors
function generateColorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
}

// Helper to get field value with fallbacks
function getField(obj, ...fields) {
    for (const field of fields) {
        if (obj[field] !== undefined && obj[field] !== null && obj[field] !== '') {
            return obj[field];
        }
    }
    return '';
}

// Group products by base serial
function groupProductsByBase(products) {
    const groups = {};
    
    products.forEach(p => {
        // Try multiple field name variations
        const serialNo = getField(p, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
        const baseSerial = getBaseSerial(serialNo) || serialNo || 'UNKNOWN';
        
        if (!groups[baseSerial]) {
            groups[baseSerial] = [];
        }
        groups[baseSerial].push(p);
    });
    
    // Sort variants by color name
    Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => {
            const colorA = getField(a, 'Color', 'color') || '';
            const colorB = getField(b, 'Color', 'color') || '';
            return colorA.localeCompare(colorB);
        });
    });
    
    return groups;
}

function renderProducts() {
    const container = document.getElementById('products-table');
    if (!container) return;
    
    console.log('📦 Rendering products, total:', allData.products.length);
    if (allData.products.length > 0) {
        console.log('📦 Sample product keys:', Object.keys(allData.products[0]));
        console.log('📦 Sample product:', allData.products[0]);
    }
    
    const search = document.getElementById('product-search')?.value.toLowerCase() || '';
    
    let products = [...allData.products];
    
    // Search filter with field fallbacks
    if (search) {
        products = products.filter(p => {
            const serial = getField(p, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
            const name = getField(p, 
                'Saree_Name', 'Product_Name', 'Name', 'Product Name', 'Saree Name',
                'Item_Name', 'Item Name', 'Product', 'saree_name', 'product_name',
                'name', 'item_name'
            ) || '';
            const color = getField(p, 'Color', 'color') || '';
            const category = getField(p, 'Category', 'category') || '';
            const fabric = getField(p, 'Fabric', 'fabric') || '';
            return serial.toLowerCase().includes(search) ||
                   name.toLowerCase().includes(search) ||
                   color.toLowerCase().includes(search) ||
                   category.toLowerCase().includes(search) ||
                   fabric.toLowerCase().includes(search);
        });
    }
    
    // Group by base serial
    const groupedProducts = groupProductsByBase(products);
    
    if (Object.keys(groupedProducts).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>No products found</h3>
                <p>${allData.products.length === 0 ? 'Products sheet mein data check karo' : 'Try different search'}</p>
                <button class="btn btn-primary" onclick="openProductModal()">
                    <i class="fas fa-plus"></i> Add Product
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="products-grid">
            ${Object.entries(groupedProducts).map(([baseSerial, variants]) => {
                const mainProduct = variants[0];
                const hasMultipleColors = variants.length > 1;
                
                // Get fields with fallbacks
                const serialNo = getField(mainProduct, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || baseSerial || '-';
                
                // Try to get product name with many variations
                let productName = getField(mainProduct, 
                    'Saree_Name', 'Product_Name', 'Name', 'Product Name', 'Saree Name', 
                    'Item_Name', 'Item Name', 'Product', 'saree_name', 'product_name', 
                    'name', 'item_name', 'ProductName', 'SareeName'
                );
                
                // If still not found, log available keys for debugging
                if (!productName || productName === 'Unnamed') {
                    console.log('⚠️ Product name not found. Available keys:', Object.keys(mainProduct));
                    console.log('⚠️ Product data:', mainProduct);
                    // Try to find any field that might contain the name
                    for (const key in mainProduct) {
                        if (key.toLowerCase().includes('name') || key.toLowerCase().includes('product') || key.toLowerCase().includes('saree')) {
                            const value = mainProduct[key];
                            if (value && value !== '' && value !== 'Unnamed') {
                                productName = value;
                                console.log(`✅ Found product name in field: ${key} = ${value}`);
                                break;
                            }
                        }
                    }
                }
                
                productName = productName || 'Unnamed';
                const price = getField(mainProduct, 'Price', 'price') || '0';
                const fabric = getField(mainProduct, 'Fabric', 'fabric') || '';
                const category = getField(mainProduct, 'Category', 'category') || '';
                const imageUrl = convertDriveLink(
                    getField(mainProduct, 'Image_URL', 'image_url', 'ImageURL', 'Image URL')
                );
                
                // Calculate total stock
                const totalStock = variants.reduce((sum, v) => {
                    const qty = parseInt(getField(v, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty')) || 0;
                    return sum + qty;
                }, 0);
                
                const stockClass = totalStock === 0 ? 'out' : totalStock <= 5 ? 'low' : 'in';
                const stockLabel = totalStock === 0 ? 'Out of Stock' : totalStock <= 5 ? 'Low Stock' : 'In Stock';
                
                return `
                    <div class="product-card ${totalStock === 0 ? 'out-of-stock' : ''}">
                        <div class="product-image" ${hasMultipleColors ? `onclick="openProductGallery('${escapeHtml(baseSerial)}')" style="cursor: pointer;"` : ''}>
                            ${imageUrl ? 
                                `<img src="${imageUrl}" alt="${escapeHtml(productName)}" 
                                    onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'no-image\\'><i class=\\'fas fa-image\\'></i></div>';">` :
                                `<div class="no-image"><i class="fas fa-image"></i></div>`
                            }
                            
                            <!-- Color Dots -->
                            ${hasMultipleColors ? `
                                <div class="color-dots">
                                    ${variants.slice(0, 5).map(v => {
                                        const color = getField(v, 'Color', 'color') || 'N/A';
                                        const qty = parseInt(getField(v, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty')) || 0;
                                        return `
                                            <span class="color-dot" 
                                                  style="background-color: ${getColorHex(color)}" 
                                                  title="${escapeHtml(color)} - ${qty} pcs">
                                            </span>
                                        `;
                                    }).join('')}
                                    ${variants.length > 5 ? `<span class="color-dot more">+${variants.length - 5}</span>` : ''}
                                </div>
                            ` : ''}
                            
                            <span class="stock-badge ${stockClass}">${stockLabel}</span>
                        </div>
                        
                        <div class="product-info">
                            <div class="product-header">
                                <span class="serial">${escapeHtml(serialNo)}</span>
                                ${hasMultipleColors ? `<span class="variant-badge">${variants.length} colors</span>` : ''}
                            </div>
                            
                            ${hasMultipleColors && variants.length > 1 ? `
                                <div style="font-size: 11px; color: var(--gray-500); margin-bottom: 5px;">
                                    <i class="fas fa-tags"></i> All: ${variants.map(v => {
                                        const s = getField(v, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
                                        return escapeHtml(s);
                                    }).join(', ')}
                                </div>
                            ` : ''}
                            
                            <h4>${escapeHtml(productName)}</h4>
                            
                            <div class="product-meta">
                                <span><i class="fas fa-palette"></i> ${escapeHtml(getField(mainProduct, 'Color', 'color') || '-')}</span>
                                <span><i class="fas fa-layer-group"></i> ${escapeHtml(fabric || category || '-')}</span>
                                <span><i class="fas fa-boxes"></i> ${totalStock} pcs total</span>
                            </div>
                            
                            <div class="product-price">₹${formatNumber(price)}</div>
                            
                            <!-- Color-wise Stock List -->
                            ${hasMultipleColors ? `
                                <div class="color-stock-list">
                                    ${variants.map(v => {
                                        const color = getField(v, 'Color', 'color') || 'N/A';
                                        const variantSerial = getField(v, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
                                        const qty = parseInt(getField(v, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty')) || 0;
                                        return `
                                            <div class="color-stock-item">
                                                <span class="color-dot-small" style="background-color: ${getColorHex(color)}"></span>
                                                <span class="color-name">${escapeHtml(color)}</span>
                                                <span class="color-code" title="Serial: ${escapeHtml(variantSerial)}">${escapeHtml(getColorCode(variantSerial) || variantSerial)}</span>
                                                <span class="stock-qty ${qty === 0 ? 'out' : qty <= 3 ? 'low' : ''}">${qty}</span>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="product-actions">
                            <button class="btn btn-sm btn-outline" onclick="openProductModal('${escapeHtml(serialNo)}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-success" onclick="openAddColorModal('${escapeHtml(baseSerial)}', '${escapeHtml(productName)}')">
                                <i class="fas fa-palette"></i> + Color
                            </button>
                            ${hasMultipleColors ? `
                                <button class="btn btn-sm btn-info" onclick="openProductGallery('${escapeHtml(baseSerial)}')">
                                    <i class="fas fa-images"></i> All
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${escapeHtml(serialNo)}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            `}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ==========================================
// ADD COLOR VARIANT MODAL
// ==========================================

function openAddColorModal(baseSerial, productName) {
    // Get existing product details
    const existingVariants = allData.products.filter(p => {
        const serial = getField(p, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
        return getBaseSerial(serial) === baseSerial;
    });
    
    if (existingVariants.length === 0) {
        showToast('Product not found!', 'error');
        return;
    }
    
    const mainProduct = existingVariants[0];
    const existingColors = existingVariants.map(v => {
        const color = getField(v, 'Color', 'color') || '';
        return color.toLowerCase();
    }).filter(Boolean);
    
    // Remove existing modal if any
    document.getElementById('add-color-modal')?.remove();
    
    const modalHtml = `
        <div class="modal active" id="add-color-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-palette"></i> Add Color Variant</h3>
                    <button class="modal-close" onclick="closeModal('add-color-modal'); document.getElementById('add-color-modal')?.remove();">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="info-box">
                        <strong>Product:</strong> ${escapeHtml(productName)}<br>
                        <strong>Base Serial:</strong> ${escapeHtml(baseSerial)}<br>
                        <strong>Existing Colors:</strong> ${existingColors.length > 0 ? existingColors.join(', ') : 'None'}
                    </div>
                    
                    <form id="add-color-form" onsubmit="saveColorVariant(event, '${escapeHtml(baseSerial)}')">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Color Name *</label>
                                <input type="text" id="new-color-name" placeholder="e.g., Red, Blue, Rani" required>
                            </div>
                            <div class="form-group">
                                <label>Color Code (1-3 letters) *</label>
                                <input type="text" id="new-color-code" placeholder="e.g., R, BL, RN" maxlength="3" required 
                                       oninput="this.value = this.value.toUpperCase(); document.getElementById('serial-preview').textContent = '${escapeHtml(baseSerial)}-' + this.value;">
                                <small>New Serial: <strong id="serial-preview">${escapeHtml(baseSerial)}-?</strong></small>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Stock Quantity *</label>
                                <input type="number" id="new-color-stock" min="0" value="10" required>
                            </div>
                            <div class="form-group">
                                <label>Price (₹)</label>
                                <input type="number" id="new-color-price" value="${getField(mainProduct, 'Price', 'price') || ''}" placeholder="Same as main">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Image URL (Google Drive)</label>
                            <input type="url" id="new-color-image" placeholder="https://drive.google.com/..." 
                                   oninput="previewNewColorImage(this.value)">
                            <div id="new-color-image-preview" class="image-preview"></div>
                        </div>
                        
                        <div class="color-suggestions">
                            <label>Quick Colors:</label>
                            <div class="color-chips">
                                ${['Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Orange', 'Black', 'White', 'Maroon', 'Navy', 'Gold'].map(color => `
                                    <span class="color-chip" 
                                          style="background-color: ${getColorHex(color)}" 
                                          onclick="selectQuickColor('${color}')"
                                          title="${color}">
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeModal('add-color-modal'); document.getElementById('add-color-modal')?.remove();">Cancel</button>
                            <button type="submit" class="btn btn-success">
                                <i class="fas fa-plus"></i> Add Color Variant
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function selectQuickColor(color) {
    document.getElementById('new-color-name').value = color;
    document.getElementById('new-color-code').value = color.substring(0, 2).toUpperCase();
    
    const baseSerial = document.getElementById('serial-preview').textContent.split('-')[0];
    document.getElementById('serial-preview').textContent = baseSerial + '-' + color.substring(0, 2).toUpperCase();
}

function previewNewColorImage(url) {
    const preview = document.getElementById('new-color-image-preview');
    if (preview) {
        const convertedUrl = convertDriveLink(url);
        preview.innerHTML = convertedUrl ? `<img src="${convertedUrl}" alt="Preview" onerror="this.parentElement.innerHTML='Invalid URL'">` : '';
    }
}

async function saveColorVariant(event, baseSerial) {
    event.preventDefault();
    
    const color = document.getElementById('new-color-name').value.trim();
    const code = document.getElementById('new-color-code').value.trim().toUpperCase();
    const stock = document.getElementById('new-color-stock').value;
    const price = document.getElementById('new-color-price').value;
    const imageUrl = document.getElementById('new-color-image').value.trim();
    
    if (!color || !code) {
        return showToast('Color name aur code required hai!', 'error');
    }
    
    // Get base product details
    const existingVariants = allData.products.filter(p => getBaseSerial(p.Serial_No) === baseSerial);
    if (existingVariants.length === 0) {
        return showToast('Base product not found!', 'error');
    }
    
    const mainProduct = existingVariants[0];
    const newSerialNo = `${baseSerial}-${code}`;
    
    // Check if this serial already exists
    if (allData.products.find(p => p.Serial_No === newSerialNo)) {
        return showToast(`Serial ${newSerialNo} already exists! Use different code.`, 'error');
    }
    
    // Check if color already exists
    if (existingVariants.find(v => {
        const existingColor = getField(v, 'Color', 'color') || '';
        return existingColor.toLowerCase() === color.toLowerCase();
    })) {
        return showToast(`${color} color already exists for this product!`, 'error');
    }
    
    try {
        showLoading(true, 'Adding color variant...');
        
        const variantData = {
            Serial_No: newSerialNo,
            Saree_Name: getField(mainProduct, 
                'Saree_Name', 'Product_Name', 'Name', 'Product Name', 'Saree Name',
                'Item_Name', 'Item Name', 'Product', 'saree_name', 'product_name',
                'name', 'item_name'
            ) || '',
            Category: getField(mainProduct, 'Category', 'category') || '',
            Fabric: getField(mainProduct, 'Fabric', 'fabric') || '',
            Color: color,
            Price: price || getField(mainProduct, 'Price', 'price') || '0',
            Stock_Qty: stock,
            Stock_Status: parseInt(stock) > 0 ? (parseInt(stock) <= 5 ? 'Low Stock' : 'In Stock') : 'Out of Stock',
            Image_URL: imageUrl,
            Added_Date: new Date().toISOString().split('T')[0]
        };
        
        await postToWebhook(API.addProduct, variantData);
        
        closeModal('add-color-modal');
        document.getElementById('add-color-modal')?.remove();
        
        await loadAllData();
        showToast(`✅ ${color} variant added successfully!`, 'success');
        
    } catch (error) {
        console.error('Add variant error:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// PRODUCT GALLERY MODAL (All Colors)
// ==========================================

function openProductGallery(baseSerial) {
    const variants = allData.products.filter(p => {
        const serial = getField(p, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
        return getBaseSerial(serial) === baseSerial;
    });
    
    if (variants.length === 0) {
        showToast('Product not found!', 'error');
        return;
    }
    
    const mainProduct = variants[0];
    const productName = getField(mainProduct, 
        'Saree_Name', 'Product_Name', 'Name', 'Product Name', 'Saree Name',
        'Item_Name', 'Item Name', 'Product', 'saree_name', 'product_name',
        'name', 'item_name'
    ) || 'Unnamed';
    const price = getField(mainProduct, 'Price', 'price') || '0';
    
    // Remove existing modal
    document.getElementById('gallery-modal')?.remove();
    
    const modalHtml = `
        <div class="modal active" id="gallery-modal">
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3><i class="fas fa-images"></i> ${escapeHtml(productName)} - All Colors</h3>
                    <button class="modal-close" onclick="closeModal('gallery-modal'); document.getElementById('gallery-modal')?.remove();">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="gallery-info">
                        <span><i class="fas fa-tag"></i> Base: ${escapeHtml(baseSerial)}</span>
                        <span><i class="fas fa-palette"></i> ${variants.length} Colors</span>
                        <span><i class="fas fa-boxes"></i> Total: ${variants.reduce((sum, v) => {
                            const qty = parseInt(getField(v, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty')) || 0;
                            return sum + qty;
                        }, 0)} pcs</span>
                        <span><i class="fas fa-rupee-sign"></i> ₹${formatNumber(price)}</span>
                    </div>
                    
                    <div class="gallery-grid">
                        ${variants.map(v => {
                            const imageUrl = convertDriveLink(
                                getField(v, 'Image_URL', 'image_url', 'ImageURL', 'Image URL')
                            );
                            const stock = parseInt(getField(v, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty')) || 0;
                            const stockClass = stock === 0 ? 'out' : stock <= 5 ? 'low' : 'in';
                            const color = getField(v, 'Color', 'color') || 'N/A';
                            const variantSerial = getField(v, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
                            
                            return `
                                <div class="gallery-item ${stock === 0 ? 'out-of-stock' : ''}">
                                    <div class="gallery-image" onclick="viewFullImage('${escapeHtml(imageUrl)}', '${escapeHtml(color)}')">
                                        ${imageUrl ? 
                                            `<img src="${imageUrl}" alt="${escapeHtml(color)}" onerror="this.src='https://via.placeholder.com/200?text=No+Image'">` :
                                            `<div class="no-image"><i class="fas fa-image"></i></div>`
                                        }
                                    </div>
                                    <div class="gallery-info-item">
                                        <div class="gallery-color">
                                            <span class="color-dot-small" style="background-color: ${getColorHex(color)}"></span>
                                            <strong>${escapeHtml(color)}</strong>
                                        </div>
                                        <div class="gallery-serial">${escapeHtml(variantSerial)}</div>
                                        <div class="gallery-stock ${stockClass}">
                                            <i class="fas fa-boxes"></i> ${stock} pcs
                                        </div>
                                    </div>
                                    <div class="gallery-actions">
                                        <button class="btn btn-sm btn-outline" onclick="openProductModal('${escapeHtml(variantSerial)}')" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline" onclick="quickStockUpdate('${escapeHtml(variantSerial)}', 1)" title="+1 Stock">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline" onclick="quickStockUpdate('${escapeHtml(variantSerial)}', -1)" title="-1 Stock">
                                            <i class="fas fa-minus"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="deleteProduct('${escapeHtml(variantSerial)}')" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    
                    <div class="gallery-footer">
                        <button class="btn btn-success" onclick="closeModal('gallery-modal'); openAddColorModal('${escapeHtml(baseSerial)}', '${escapeHtml(productName)}')">
                            <i class="fas fa-plus"></i> Add New Color
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function viewFullImage(url, title) {
    if (!url) return;
    
    document.getElementById('fullimage-modal')?.remove();
    
    const modalHtml = `
        <div class="modal active" id="fullimage-modal" onclick="if(event.target === this) { this.remove(); }">
            <div class="modal-content modal-image">
                <button class="modal-close" onclick="document.getElementById('fullimage-modal')?.remove()">&times;</button>
                <h4 style="color: white; text-align: center; margin-bottom: 10px;">${escapeHtml(title)}</h4>
                <img src="${url}" alt="${escapeHtml(title)}" style="max-width: 100%; max-height: 80vh; border-radius: 12px;">
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Quick stock update
async function quickStockUpdate(serialNo, change) {
    const product = allData.products.find(p => {
        const serial = getField(p, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
        return serial === serialNo;
    });
    if (!product) return;
    
    const currentQty = parseInt(getField(product, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty')) || 0;
    const newQty = Math.max(0, currentQty + change);
    
    if (newQty === currentQty) return;
    
    try {
        let stockStatus = 'In Stock';
        if (newQty === 0) stockStatus = 'Out of Stock';
        else if (newQty <= 5) stockStatus = 'Low Stock';
        
        await postToWebhook(API.updateProduct, {
            Serial_No: serialNo,
            Stock_Qty: newQty.toString(),
            Stock_Status: stockStatus
        });
        
        // Update local data immediately
        product.Stock_Qty = newQty.toString();
        product.Stock_Status = stockStatus;
        
        // Re-render
        renderProducts();
        
        // Refresh gallery if open
        const galleryModal = document.getElementById('gallery-modal');
        if (galleryModal) {
            const baseSerial = getBaseSerial(serialNo);
            document.getElementById('gallery-modal')?.remove();
            openProductGallery(baseSerial);
        }
        
        showToast(`Stock updated: ${newQty}`, 'success');
        
    } catch (error) {
        console.error('Stock update error:', error);
        showToast('Error updating stock', 'error');
    }
}


// ==========================================
// DAILY REPORT TAB - Complete Code
// ==========================================

let currentReportFilter = 'today';

// Set Report Filter
function setReportFilter(filter) {
    currentReportFilter = filter;
    
    // Update active button
    document.querySelectorAll('.report-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    // Re-render report
    renderDailyReport();
}

// Main Render Function
function renderDailyReport() {
    const container = document.getElementById('daily-report-content');
    if (!container) return;
    
    // Calculate date range based on filter
    let startDate, endDate;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    switch (currentReportFilter) {
        case 'today':
            startDate = new Date(now);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'yesterday':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'this_week':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - startDate.getDay());
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'this_month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'this_year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'lifetime':
            startDate = new Date(2020, 0, 1);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        default:
            startDate = new Date(now);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
    }
    
    // Filter orders by date range (excluding cancelled)
    const filteredOrders = allData.orders.filter(o => {
        const orderDate = new Date(o.Order_Date || o.Timestamp);
        return orderDate >= startDate && orderDate <= endDate && o.Status?.toLowerCase() !== 'cancelled';
    });
    
    // Get cancelled orders separately
    const cancelledOrders = allData.orders.filter(o => {
        const orderDate = new Date(o.Order_Date || o.Timestamp);
        return orderDate >= startDate && orderDate <= endDate && o.Status?.toLowerCase() === 'cancelled';
    });
    
    // Filter payments by date range
    const filteredPayments = allData.payments.filter(p => {
        const paymentDate = new Date(p.Timestamp || p.Payment_Date);
        return paymentDate >= startDate && paymentDate <= endDate;
    });
    
    // Calculate statistics
    const totalSales = filteredOrders.reduce((sum, o) => sum + (parseFloat(o.Amount) || 0), 0);
    const totalOrders = filteredOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    
    // Order status counts
    const pendingOrders = filteredOrders.filter(o => o.Status?.toLowerCase() === 'pending').length;
    const confirmedOrders = filteredOrders.filter(o => o.Status?.toLowerCase() === 'confirmed').length;
    const shippedOrders = filteredOrders.filter(o => o.Status?.toLowerCase() === 'shipped').length;
    const deliveredOrders = filteredOrders.filter(o => o.Status?.toLowerCase() === 'delivered').length;
    
    // Payment statistics
    const totalPayments = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.Advance_Paid || p.Amount) || 0), 0);
    const verifiedPayments = filteredPayments.filter(p => p.Status?.toLowerCase() === 'verified').length;
    const pendingPayments = filteredPayments.filter(p => !p.Status || p.Status.toLowerCase().includes('pending')).length;
    
    // Payment type split
    const codOrders = filteredOrders.filter(o => o.Payment_Type?.toLowerCase().includes('cod')).length;
    const onlineOrders = filteredOrders.filter(o => 
        o.Payment_Type && !o.Payment_Type.toLowerCase().includes('cod')
    ).length;
    
    // Top selling products
    const productSales = {};
    filteredOrders.forEach(o => {
        const productName = o.Product_Name || o.Serial_No || 'Unknown Product';
        if (!productSales[productName]) {
            productSales[productName] = { count: 0, revenue: 0 };
        }
        productSales[productName].count++;
        productSales[productName].revenue += parseFloat(o.Amount) || 0;
    });
    
    const topProducts = Object.entries(productSales)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
    
    // Get filter label for display
    const filterLabels = {
        'today': 'Today',
        'yesterday': 'Yesterday',
        'this_week': 'This Week',
        'this_month': 'This Month',
        'this_year': 'This Year',
        'lifetime': 'All Time'
    };
    
    // Render the report
    container.innerHTML = `
        <!-- Summary Header -->
        <div class="report-summary-header">
            <div class="summary-period">
                <i class="fas fa-calendar-alt"></i>
                <span>Showing data for: <strong>${filterLabels[currentReportFilter]}</strong></span>
                <span class="date-range">(${formatDate(startDate)} - ${formatDate(endDate)})</span>
            </div>
        </div>
        
        <!-- Report Cards Grid -->
        <div class="report-grid">
            <!-- Sales Overview Card -->
            <div class="report-card primary">
                <div class="report-card-header">
                    <h4><i class="fas fa-rupee-sign"></i> Sales Overview</h4>
                </div>
                <div class="report-card-body">
                    <div class="report-stat main">
                        <span class="value">₹${formatNumber(totalSales)}</span>
                        <span class="label">Total Revenue</span>
                    </div>
                    <div class="report-stat-row">
                        <div class="report-stat small">
                            <span class="value">${totalOrders}</span>
                            <span class="label">Total Orders</span>
                        </div>
                        <div class="report-stat small">
                            <span class="value">₹${formatNumber(avgOrderValue)}</span>
                            <span class="label">Avg Order Value</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Order Status Card -->
            <div class="report-card success">
                <div class="report-card-header">
                    <h4><i class="fas fa-shopping-cart"></i> Order Status Breakdown</h4>
                </div>
                <div class="report-card-body">
                    <div class="status-bars">
                        <div class="status-bar-item">
                            <span class="label">Pending</span>
                            <div class="bar-container">
                                <div class="bar pending" style="width: ${totalOrders > 0 ? (pendingOrders/totalOrders*100) : 0}%"></div>
                            </div>
                            <span class="count">${pendingOrders}</span>
                        </div>
                        <div class="status-bar-item">
                            <span class="label">Confirmed</span>
                            <div class="bar-container">
                                <div class="bar confirmed" style="width: ${totalOrders > 0 ? (confirmedOrders/totalOrders*100) : 0}%"></div>
                            </div>
                            <span class="count">${confirmedOrders}</span>
                        </div>
                        <div class="status-bar-item">
                            <span class="label">Shipped</span>
                            <div class="bar-container">
                                <div class="bar shipped" style="width: ${totalOrders > 0 ? (shippedOrders/totalOrders*100) : 0}%"></div>
                            </div>
                            <span class="count">${shippedOrders}</span>
                        </div>
                        <div class="status-bar-item">
                            <span class="label">Delivered</span>
                            <div class="bar-container">
                                <div class="bar delivered" style="width: ${totalOrders > 0 ? (deliveredOrders/totalOrders*100) : 0}%"></div>
                            </div>
                            <span class="count">${deliveredOrders}</span>
                        </div>
                        <div class="status-bar-item">
                            <span class="label">Cancelled</span>
                            <div class="bar-container">
                                <div class="bar cancelled" style="width: ${(totalOrders + cancelledOrders.length) > 0 ? (cancelledOrders.length/(totalOrders + cancelledOrders.length)*100) : 0}%"></div>
                            </div>
                            <span class="count">${cancelledOrders.length}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Payment Summary Card -->
            <div class="report-card warning">
                <div class="report-card-header">
                    <h4><i class="fas fa-credit-card"></i> Payment Summary</h4>
                </div>
                <div class="report-card-body">
                    <div class="report-stat main">
                        <span class="value">₹${formatNumber(totalPayments)}</span>
                        <span class="label">Total Collected</span>
                    </div>
                    <div class="report-stat-row">
                        <div class="report-stat small success">
                            <span class="value">${verifiedPayments}</span>
                            <span class="label">Verified</span>
                        </div>
                        <div class="report-stat small warning">
                            <span class="value">${pendingPayments}</span>
                            <span class="label">Pending</span>
                        </div>
                    </div>
                    <div class="payment-type-split">
                        <div class="type-item">
                            <i class="fas fa-globe"></i>
                            <span>Online Orders: <strong>${onlineOrders}</strong></span>
                        </div>
                        <div class="type-item">
                            <i class="fas fa-truck"></i>
                            <span>COD Orders: <strong>${codOrders}</strong></span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Top Products Card -->
            <div class="report-card info">
                <div class="report-card-header">
                    <h4><i class="fas fa-trophy"></i> Top Selling Products</h4>
                </div>
                <div class="report-card-body">
                    ${topProducts.length > 0 ? `
                        <div class="top-products-list">
                            ${topProducts.map(([name, data], index) => `
                                <div class="top-product-item">
                                    <span class="rank">#${index + 1}</span>
                                    <span class="name" title="${escapeHtml(name)}">${escapeHtml(name.substring(0, 30))}${name.length > 30 ? '...' : ''}</span>
                                    <span class="count">${data.count} sold</span>
                                    <span class="revenue">₹${formatNumber(data.revenue)}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="empty-text">
                            <i class="fas fa-box-open"></i>
                            <p>No sales in this period</p>
                        </div>
                    `}
                </div>
            </div>
        </div>
        
        <!-- Orders Table Section -->
        <div class="report-section">
            <h4><i class="fas fa-list-alt"></i> Orders in This Period (${totalOrders})</h4>
            ${filteredOrders.length > 0 ? `
                <div class="table-responsive">
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Order ID</th>
                                <th>Date</th>
                                <th>Customer</th>
                                <th>Product</th>
                                <th>Amount</th>
                                <th>Payment</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredOrders.slice(0, 15).map(o => `
                                <tr onclick="viewOrder('${escapeHtml(o.Order_ID)}')" style="cursor: pointer;">
                                    <td><strong>#${escapeHtml(o.Order_ID)}</strong></td>
                                    <td>${formatDate(o.Order_Date || o.Timestamp)}</td>
                                    <td>${escapeHtml(o.Customer_Name || '-')}</td>
                                    <td title="${escapeHtml(o.Product_Name || o.Serial_No || '-')}">${escapeHtml((o.Product_Name || o.Serial_No || '-').substring(0, 25))}${(o.Product_Name || o.Serial_No || '').length > 25 ? '...' : ''}</td>
                                    <td><strong>₹${formatNumber(o.Amount)}</strong></td>
                                    <td><span class="payment-type-badge">${escapeHtml(o.Payment_Type || '-')}</span></td>
                                    <td><span class="status-badge ${getStatusClass(o.Status)}">${escapeHtml(o.Status || 'Pending')}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${filteredOrders.length > 15 ? `
                    <div class="more-text">
                        <i class="fas fa-info-circle"></i> Showing 15 of ${filteredOrders.length} orders. 
                        <a href="#" onclick="switchTab('orders'); return false;">View all in Orders tab</a>
                    </div>
                ` : ''}
            ` : `
                <div class="empty-text">
                    <i class="fas fa-inbox"></i>
                    <p>No orders found in this period</p>
                </div>
            `}
        </div>
    `;
}

// ==========================================
// NOTIFICATIONS SYSTEM
// ==========================================

function checkNotifications() {
    const notifications = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 1. Low Stock Products (1-5 items)
    const lowStockProducts = allData.products.filter(p => {
        const qty = parseInt(getField(p, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty')) || 0;
        return qty > 0 && qty <= 5;
    });
    
    if (lowStockProducts.length > 0) {
        notifications.push({
            type: 'warning',
            icon: 'fa-box',
            title: 'Low Stock Alert',
            message: `${lowStockProducts.length} product${lowStockProducts.length > 1 ? 's' : ''} running low on stock`,
            items: lowStockProducts.slice(0, 3).map(p => {
                // Try multiple field name variations for product name
                let name = getField(p, 
                    'Saree_Name', 'Product_Name', 'Name', 'Product Name', 'Saree Name',
                    'Item_Name', 'Item Name', 'Product', 'saree_name', 'product_name',
                    'name', 'item_name', 'ProductName', 'SareeName'
                );
                
                // If still not found, try Serial No
                if (!name || name === 'Unnamed' || name.trim() === '') {
                    name = getField(p, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
                }
                
                // Last resort: check all keys for anything that might be a name
                if (!name || name.trim() === '') {
                    for (const key in p) {
                        const value = p[key];
                        if (value && typeof value === 'string' && value.length > 0 && 
                            (key.toLowerCase().includes('name') || key.toLowerCase().includes('product') || key.toLowerCase().includes('saree'))) {
                            name = value;
                            break;
                        }
                    }
                }
                
                const qty = getField(p, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty') || '0';
                const displayName = name || ('Product (Serial: ' + (getField(p, 'Serial_No', 'Serial No') || 'N/A') + ')');
                return `${displayName}: Only ${qty} left`;
            })
        });
    }
    
    // 2. Out of Stock Products - Only show if stock is actually 0
    const outOfStockProducts = allData.products.filter(p => {
        const qty = parseInt(getField(p, 'Stock_Qty', 'Stock Qty', 'stock_qty', 'StockQty')) || 0;
        // Only count as out of stock if qty is explicitly 0 (not empty/null/undefined)
        return qty === 0;
    });
    
    if (outOfStockProducts.length > 0) {
        notifications.push({
            type: 'danger',
            icon: 'fa-exclamation-triangle',
            title: 'Out of Stock!',
            message: `${outOfStockProducts.length} product${outOfStockProducts.length > 1 ? 's are' : ' is'} out of stock`,
            items: outOfStockProducts.slice(0, 3).map(p => {
                // Try multiple field name variations for product name
                let name = getField(p, 
                    'Saree_Name', 'Product_Name', 'Name', 'Product Name', 'Saree Name',
                    'Item_Name', 'Item Name', 'Product', 'saree_name', 'product_name',
                    'name', 'item_name', 'ProductName', 'SareeName'
                );
                
                // If still not found, try Serial No
                if (!name || name === 'Unnamed' || name.trim() === '') {
                    name = getField(p, 'Serial_No', 'Serial No', 'serial_no', 'SerialNo') || '';
                }
                
                // Last resort: check all keys for anything that might be a name
                if (!name || name.trim() === '') {
                    for (const key in p) {
                        const value = p[key];
                        if (value && typeof value === 'string' && value.length > 0 && 
                            (key.toLowerCase().includes('name') || key.toLowerCase().includes('product') || key.toLowerCase().includes('saree'))) {
                            name = value;
                            break;
                        }
                    }
                }
                
                return name || 'Product (Serial: ' + (getField(p, 'Serial_No', 'Serial No') || 'N/A') + ')';
            })
        });
    }
    
    // 3. Today's Followups
    const todayFollowups = allData.leads.filter(l => {
        if (!l.Followup_Date) return false;
        const followupDate = new Date(l.Followup_Date);
        followupDate.setHours(0, 0, 0, 0);
        return followupDate.getTime() === today.getTime();
    });
    
    if (todayFollowups.length > 0) {
        notifications.push({
            type: 'info',
            icon: 'fa-phone',
            title: "Today's Followups",
            message: `${todayFollowups.length} customer${todayFollowups.length > 1 ? 's' : ''} to call today`,
            items: todayFollowups.slice(0, 3).map(l => `${l.Name}: ${l.Phone}`)
        });
    }
    
    // 4. Overdue Followups
    const overdueFollowups = allData.leads.filter(l => {
        if (!l.Followup_Date) return false;
        const followupDate = new Date(l.Followup_Date);
        followupDate.setHours(0, 0, 0, 0);
        return followupDate < today;
    });
    
    if (overdueFollowups.length > 0) {
        notifications.push({
            type: 'danger',
            icon: 'fa-calendar-times',
            title: 'Overdue Followups!',
            message: `${overdueFollowups.length} followup${overdueFollowups.length > 1 ? 's' : ''} missed`,
            items: overdueFollowups.slice(0, 3).map(l => `${l.Name} (Due: ${formatDate(l.Followup_Date)})`)
        });
    }
    
    // 5. Pending Payments to Verify
    const pendingPaymentsToVerify = allData.payments.filter(p => 
        !p.Status || p.Status.toLowerCase().includes('pending')
    );
    
    if (pendingPaymentsToVerify.length > 0) {
        notifications.push({
            type: 'warning',
            icon: 'fa-credit-card',
            title: 'Pending Payments',
            message: `${pendingPaymentsToVerify.length} payment${pendingPaymentsToVerify.length > 1 ? 's' : ''} need verification`,
            items: pendingPaymentsToVerify.slice(0, 3).map(p => {
                const customerName = getField(p, 'Customer_Name', 'Name', 'Customer Name', 'customer_name', 'name') || 'Customer';
                const amount = getField(p, 'Advance_Paid', 'Amount', 'advance_paid', 'amount', 'Total_Amount', 'Total Amount') || '0';
                return `${customerName}: ₹${formatNumber(amount)}`;
            })
        });
    }
    
    // 6. Pending Orders to Process
    const pendingOrdersToProcess = allData.orders.filter(o => 
        o.Status?.toLowerCase() === 'pending'
    );
    
    if (pendingOrdersToProcess.length > 0) {
        notifications.push({
            type: 'info',
            icon: 'fa-shopping-cart',
            title: 'Pending Orders',
            message: `${pendingOrdersToProcess.length} order${pendingOrdersToProcess.length > 1 ? 's' : ''} need processing`,
            items: pendingOrdersToProcess.slice(0, 3).map(o => `#${o.Order_ID}: ${o.Customer_Name}`)
        });
    }
    
    // 7. New Orders in Last Hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOrders = allData.orders.filter(o => {
        const orderDate = new Date(o.Order_Date || o.Timestamp);
        return orderDate >= oneHourAgo;
    });
    
    if (recentOrders.length > 0) {
        notifications.push({
            type: 'success',
            icon: 'fa-bell',
            title: 'New Orders!',
            message: `${recentOrders.length} new order${recentOrders.length > 1 ? 's' : ''} in last hour`,
            items: recentOrders.slice(0, 3).map(o => `#${o.Order_ID}: ₹${formatNumber(o.Amount)}`)
        });
    }
    
    // 8. Hot Leads Reminder
    const hotLeads = allData.leads.filter(l => l.Status?.toLowerCase() === 'hot');
    if (hotLeads.length > 0) {
        notifications.push({
            type: 'danger',
            icon: 'fa-fire',
            title: 'Hot Leads!',
            message: `${hotLeads.length} hot lead${hotLeads.length > 1 ? 's' : ''} - Don't miss!`,
            items: hotLeads.slice(0, 3).map(l => `${l.Name}: ${l.Phone}`)
        });
    }
    
    // Render and update badge
    renderNotifications(notifications);
    updateNotificationBadge(notifications.length);
    
    return notifications;
}

function renderNotifications(notifications) {
    const container = document.getElementById('notifications-panel');
    if (!container) return;
    
    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="empty-notifications">
                <i class="fas fa-check-circle"></i>
                <p>All caught up! No notifications.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.type}">
            <div class="notification-icon">
                <i class="fas ${n.icon}"></i>
            </div>
            <div class="notification-content">
                <h5>${escapeHtml(n.title)}</h5>
                <p>${escapeHtml(n.message)}</p>
                ${n.items && n.items.length > 0 ? `
                    <ul class="notification-items">
                        ${n.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

function toggleNotifications() {
    const panel = document.getElementById('notifications-dropdown');
    if (panel) {
        const isShowing = panel.classList.toggle('show');
        if (isShowing) {
            checkNotifications();
        }
    }
    
    // Close when clicking outside
    document.addEventListener('click', function closeNotifications(e) {
        const wrapper = document.querySelector('.notification-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            document.getElementById('notifications-dropdown')?.classList.remove('show');
            document.removeEventListener('click', closeNotifications);
        }
    });
}

// ==========================================
// UPDATE switchTab FUNCTION
// ==========================================

// Add this to your existing switchTab function or replace it:
function switchTab(tab) {
    // Update menu active state
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });
    
    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tab}-tab`);
    });
    
    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'products': 'Products',
        'orders': 'Orders',
        'payments': 'Payments',
        'customers': 'Customers',
        'leads': 'Leads',
        'daily-report': 'Daily Report'
    };
    
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.textContent = titles[tab] || 'Dashboard';
    }
    
    // Render specific tab content
    switch(tab) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'products':
            renderProducts();
            break;
        case 'orders':
            renderOrders();
            break;
        case 'payments':
            renderPayments();
            break;
        case 'customers':
            renderCustomers();
            break;
        case 'leads':
            renderLeads();
            break;
        case 'daily-report':
            renderDailyReport();
            break;
    }
    
    // Close sidebar on mobile
    if (window.innerWidth <= 992) {
        document.getElementById('sidebar')?.classList.remove('active');
    }
}





// ==========================================
// INITIALIZE ON LOAD
// ==========================================

// Add to your init/DOMContentLoaded:
document.addEventListener('DOMContentLoaded', function() {
    // ... existing init code ...
    
    // Check notifications on load
    setTimeout(() => {
        checkNotifications();
    }, 2000);
    
    // Check notifications every 5 minutes
    setInterval(() => {
        checkNotifications();
    }, 5 * 60 * 1000);
});

// Make functions globally available
window.setReportFilter = setReportFilter;
window.renderDailyReport = renderDailyReport;
window.checkNotifications = checkNotifications;
window.toggleNotifications = toggleNotifications;


// Add to global functions
window.openAddColorModal = openAddColorModal;
window.saveColorVariant = saveColorVariant;
window.selectQuickColor = selectQuickColor;
window.previewNewColorImage = previewNewColorImage;
window.openProductGallery = openProductGallery;
window.viewFullImage = viewFullImage;
window.quickStockUpdate = quickStockUpdate;

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Mamta Saree Dashboard v4.0');
    
    setupEventListeners();
    loadAllData();
    startAutoRefresh();
    switchTab('dashboard');
});

// ==========================================
// GLOBAL FUNCTIONS
// ==========================================

window.openProductModal = openProductModal;
window.saveProduct = saveProduct;
window.deleteProduct = deleteProduct;
window.viewOrder = viewOrder;
window.updateOrderStatus = updateOrderStatus;
window.approvePayment = approvePayment;
window.rejectPayment = rejectPayment;
window.viewScreenshot = viewScreenshot;
window.openLeadModal = openLeadModal;
window.saveLead = saveLead;
window.openFollowupModal = openFollowupModal;
window.updateFollowupMessage = updateFollowupMessage;
window.sendFollowupMessage = sendFollowupMessage;
window.openWhatsApp = openWhatsApp;
window.closeModal = closeModal;
window.switchTab = switchTab;




