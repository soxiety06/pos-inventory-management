// ==========================================
// 1. APP INITIALIZATION & VARIABLES
// ==========================================
let currentUserName = '';
let inventoryData = [];
let recentSalesData = [];
let selectedItemRow = null; 
let posCart = [];
let currentInvRowCount = 0;
let currentSalesRowCount = 0;
let syncInterval; 

document.addEventListener("DOMContentLoaded", checkSession);
google.charts.load('current', {'packages':['corechart']});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error("SW failed:", err));
}

// ==========================================
// 2. NATIVE GAS API WRAPPER
// ==========================================
const api = (method, ...args) => {
  // Show loader for background processes
  if (method !== 'checkAccessAPI' && method !== 'checkDataSyncAPI' && method !== 'getStartupDataAPI') {
    let loader = document.getElementById('loader-initial');
    if (loader) loader.classList.remove('hidden');
  }

  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((res) => {
        let loader = document.getElementById('loader-initial');
        if (loader) loader.classList.add('hidden');
        resolve(res);
      })
      .withFailureHandler((err) => {
        let loader = document.getElementById('loader-initial');
        if (loader) loader.classList.add('hidden');
        reject(err);
      })
      [method](...args);
  });
};

// ==========================================
// 3. AUTHENTICATION (NATIVE GMAIL)
// ==========================================
async function checkSession() {
  try {
    const accessRes = await api('checkAccessAPI');
    
    if (accessRes.status === 'approved') {
      currentUserName = accessRes.name;
      await loadGlobalData();
      document.getElementById('loader-initial').classList.add('hidden');
      startSilentSync();
      showToast(`Welcome, ${currentUserName}!`);
    } else {
      // If not approved, they shouldn't be here. 
      // Ideally, link this to your registration flow if they are a 'new_user'.
      document.getElementById('loader-initial').innerHTML = `<h3 style="color:red; text-align:center; margin-top:20vh;">Access Denied: ${accessRes.message || 'Pending Approval'}</h3>`;
    }
  } catch (e) {
    document.getElementById('loader-initial').innerHTML = `<h3 style="color:red; text-align:center; margin-top:20vh;">Error: ${e.message}</h3>`;
  }
}

function logout() {
  // To "logout" of a native GAS app, you force a refresh or direct to a logged-out Google page.
  window.top.location.href = 'https://accounts.google.com/logout';
}

// ==========================================
// 4. GLOBAL DATA & UTILITIES
// ==========================================
let expenseData = [];
let currentExpenseRowCount = 0;

// Update your silent sync interval to track expenses
function startSilentSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(async () => {
      try {
        let res = await api('checkDataSyncAPI', { 
            clientInvCount: currentInvRowCount, 
            clientSalesCount: currentSalesRowCount,
            clientExpenseCount: currentExpenseRowCount // Added
        });
        if (res && res.changed) {
           await loadGlobalData(); 
           showToast("Database synced", "success"); 
        }
      } catch(e) { }
    }, 10000); 
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
}

async function loadGlobalData() {
    try {
      const response = await api('getStartupDataAPI'); 
      
      if (response.status === 'success') {
        inventoryData = response.inventory;
        recentSalesData = response.sales;
        
        currentInvRowCount = inventoryData.length + 1;
        currentSalesRowCount = recentSalesData.length + 1;
        
        renderInventoryTable();
        populateDropdowns();
        renderDashboard();
        renderRecentSales(); 
        renderHistoryTable();
        
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
        console.error("Error loading data", error);
    }
}

// ==========================================
// 5. INVENTORY MANAGEMENT
// ==========================================
function openAddModal() {
    document.getElementById('addProductForm').reset();
    document.getElementById('addModal').classList.remove('hidden');
}

function closeAddModal() {
    document.getElementById('addModal').classList.add('hidden');
}

async function handleAddProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('btnConfirmAdd');
    btn.innerText = "Saving...";
    btn.disabled = true;
    
    const product = {
      name: document.getElementById('itemName').value,
      category: document.getElementById('itemCategory').value,
      cost: parseFloat(document.getElementById('itemCost').value),
      price: parseFloat(document.getElementById('itemPrice').value),
      stock: parseInt(document.getElementById('itemStock').value),
      threshold: parseInt(document.getElementById('itemThreshold').value)
    };

    try {
      await api('addProduct', product);
      showToast('Product added successfully!');
      closeAddModal(); 
      await loadGlobalData();
    } catch (error) {
      showToast('Error adding product: ' + error.message, 'error');
    } finally {
      btn.innerText = "Confirm";
      btn.disabled = false;
    }
}

function openEditModal(itemId) {
    const product = inventoryData.find(row => row[0] === itemId);
    if(!product) return;
    document.getElementById('editItemId').value = product[0];
    document.getElementById('editItemName').value = product[1];
    document.getElementById('editItemCategory').value = product[2];
    document.getElementById('editItemCost').value = product[3];
    document.getElementById('editItemPrice').value = product[4];
    document.getElementById('editItemStock').value = product[5];
    document.getElementById('editItemThreshold').value = product[6];
    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

async function submitEditProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveEdit');
    btn.innerText = "Saving...";
    btn.disabled = true;

    const productData = {
      id: document.getElementById('editItemId').value,
      name: document.getElementById('editItemName').value,
      category: document.getElementById('editItemCategory').value,
      cost: parseFloat(document.getElementById('editItemCost').value),
      price: parseFloat(document.getElementById('editItemPrice').value),
      stock: parseInt(document.getElementById('editItemStock').value),
      threshold: parseInt(document.getElementById('editItemThreshold').value)
    };

    try {
      await api('editProduct', productData);
      showToast('Product updated successfully!');
      closeEditModal();
      await loadGlobalData();
    } catch (error) {
      showToast('Error updating product: ' + error.message, 'error');
    } finally {
      btn.innerText = "Save Changes";
      btn.disabled = false;
    }
}

async function handleDeleteProduct(itemId, itemName) {
    if (!confirm(`Are you sure you want to delete "${itemName}"?`)) return;
    try {
      await api('deleteProduct', { itemId: itemId });
      showToast('Product deleted successfully!');
      await loadGlobalData();
    } catch (error) {
      showToast('Error deleting product: ' + error.message, 'error');
    }
}

function renderInventoryTable() {
    let html = '<table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Cost</th><th>Price</th><th>Stock</th><th>Total Value</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    
    let overallItems = 0;
    let overallCostValue = 0;
    let overallRetailValue = 0;

    if(inventoryData.length === 0) {
      html += '<tr><td colspan="9" style="text-align:center;">No inventory items found.</td></tr>';
    }

    inventoryData.forEach(row => {
      let cost = parseFloat(row[3]) || 0;
      let price = parseFloat(row[4]) || 0;
      let stock = parseInt(row[5]) || 0;
      let threshold = parseInt(row[6]) || 0;
      
      let itemTotalValue = stock > 0 ? (stock * cost) : 0;
      
      if (stock > 0) {
        overallItems += stock;
        overallCostValue += (stock * cost);
        overallRetailValue += (stock * price);
      }

      let badgeClass = 'status-good';
      let statusText = 'In Stock';
      
      if (stock <= 0) { badgeClass = 'status-danger'; statusText = 'Out of Stock'; } 
      else if (stock <= threshold) { badgeClass = 'status-warning'; statusText = 'Low Stock'; }
      
      html += `<tr>
                 <td><small style="color:var(--text-muted)">${row[0]}</small></td>
                 <td><strong>${row[1]}</strong></td>
                 <td>${row[2]}</td>
                 <td>₱${cost.toFixed(2)}</td>
                 <td>₱${price.toFixed(2)}</td>
                 <td>${stock}</td>
                 <td><strong>₱${itemTotalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                 <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
                 <td>
                   <div class="action-buttons">
                     <button onclick="openEditModal('${row[0]}')" class="btn btn-sm btn-primary">Edit</button>
                     <button onclick="handleDeleteProduct('${row[0]}', '${row[1]}')" class="btn btn-sm btn-danger">Delete</button>
                   </div>
                 </td>
               </tr>`;
    });
    html += '</tbody></table>';
    
    document.getElementById('inventoryTableContainer').innerHTML = html;
    
    const formatMoney = (val) => '₱' + val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    let elTotalItems = document.getElementById('invTotalItems');
    let elTotalCost = document.getElementById('invTotalCost');
    let elTotalRetail = document.getElementById('invTotalRetail');
    
    if (elTotalItems) elTotalItems.innerText = overallItems;
    if (elTotalCost) elTotalCost.innerText = formatMoney(overallCostValue);
    if (elTotalRetail) elTotalRetail.innerText = formatMoney(overallRetailValue);
}

function filterInventoryTable() {
    const searchInput = document.getElementById('inventorySearch').value.toLowerCase();
    const tableRows = document.querySelectorAll('#inventoryTableContainer tbody tr');

    tableRows.forEach(row => {
      if (row.cells.length === 1) return;
      const rowText = row.innerText.toLowerCase();
      if (rowText.includes(searchInput)) {
        row.style.display = ''; 
      } else {
        row.style.display = 'none'; 
      }
    });
}

// ==========================================
// 6. POS TERMINAL
// ==========================================
function populateDropdowns() {
    const list = document.getElementById('posDropdown');
    const catList = document.getElementById('categoryList');
    let categories = new Set();
    let groupedData = {};
    
    inventoryData.forEach(row => {
      let category = row[2] || 'Uncategorized';
      categories.add(category);
      if (!groupedData[category]) groupedData[category] = [];
      if (parseInt(row[5]) > 0) groupedData[category].push(row);
    });

    if (list) {
        list.innerHTML = '';
        for (const cat in groupedData) {
          if (groupedData[cat].length === 0) continue; 
          let header = document.createElement('div');
          header.className = 'dropdown-header';
          header.innerText = cat;
          list.appendChild(header);

          groupedData[cat].forEach(row => {
            let div = document.createElement('div');
            div.className = 'dropdown-item';
            div.innerHTML = `<span><strong>${row[1]}</strong> - ₱${parseFloat(row[4]).toFixed(2)}</span> <span class="stock-badge">Stock: ${row[5]}</span>`;
            div.onclick = () => selectPOSItem(row[0], row[1]);
            list.appendChild(div);
          });
        }
    }
    
    // Safety check prevents the silent crash
    if (catList) {
        catList.innerHTML = Array.from(categories).map(c => `<option value="${c}">`).join('');
    }
}

function toggleDropdown(show) {
    const dd = document.getElementById('posDropdown');
    if (show) {
      dd.classList.remove('hidden');
      filterPOSItems(); 
    } else {
      setTimeout(() => dd.classList.add('hidden'), 150);
    }
}

function filterPOSItems() {
    const search = document.getElementById('posItemSearch').value.toLowerCase();
    const items = document.querySelectorAll('#posDropdown .dropdown-item');
    const headers = document.querySelectorAll('#posDropdown .dropdown-header');

    items.forEach(item => {
      item.style.display = item.innerText.toLowerCase().includes(search) ? 'flex' : 'none';
    });

    headers.forEach(header => {
      let nextElement = header.nextElementSibling;
      let hasVisibleItems = false;
      while (nextElement && nextElement.classList.contains('dropdown-item')) {
        if (nextElement.style.display !== 'none') { hasVisibleItems = true; break; }
        nextElement = nextElement.nextElementSibling;
      }
      header.style.display = hasVisibleItems ? 'block' : 'none';
    });
}

function selectPOSItem(id, name) {
    document.getElementById('posItemSearch').value = name;
    selectedItemRow = inventoryData.find(row => row[0] === id);
    toggleDropdown(false);
}

function addToCart() {
    if (!selectedItemRow) {
      showToast('Please select an item from the dropdown first.', 'warning');
      return;
    }
    
    let qty = parseInt(document.getElementById('posQty').value) || 1;
    let currentStock = parseInt(selectedItemRow[5]);
    let price = parseFloat(selectedItemRow[4]);

    let existingItem = posCart.find(item => item.itemId === selectedItemRow[0]);
    let requestedTotalQty = existingItem ? existingItem.qty + qty : qty;

    if (requestedTotalQty > currentStock) {
      showToast(`Cannot add. Only ${currentStock} units available in stock.`, 'error');
      return;
    }

    if (existingItem) {
      existingItem.qty += qty;
      existingItem.totalAmount = existingItem.qty * price;
    } else {
      posCart.push({
        itemId: selectedItemRow[0],
        name: selectedItemRow[1],
        originalPrice: parseFloat(selectedItemRow[3]),
        sellingPrice: price,
        qty: qty,
        totalAmount: qty * price
      });
    }

    document.getElementById('posItemSearch').value = '';
    document.getElementById('posQty').value = '1';
    selectedItemRow = null;
    renderCart();
}

function removeFromCart(index) {
    posCart.splice(index, 1);
    renderCart();
}

function renderCart() {
    let cartBody = document.getElementById('cartBody');
    let totalDue = 0;

    if (posCart.length === 0) {
      cartBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: #94a3b8; padding: 15px;">Cart is empty</td></tr>';
      document.getElementById('posTotal').innerText = "0.00";
      updatePOSCalculation();
      return;
    }

    let html = '';
    posCart.forEach((item, index) => {
      totalDue += item.totalAmount;
      html += `<tr>
        <td><strong>${item.name}</strong></td>
        <td>${item.qty}</td>
        <td>₱${item.totalAmount.toFixed(2)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="removeFromCart(${index})">X</button></td>
      </tr>`;
    });

    cartBody.innerHTML = html;
    document.getElementById('posTotal').innerText = totalDue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    updatePOSCalculation();
}

function updatePOSCalculation() {
    try {
      let subtotal = 0;
      if (posCart && posCart.length > 0) {
        subtotal = posCart.reduce((sum, item) => sum + (parseFloat(item.totalAmount) || 0), 0);
      }
      
      let discountType = document.getElementById('posDiscountType').value;
      let discountInput = document.getElementById('posDiscountValue');
      let discountValue = parseFloat(discountInput.value) || 0;
      let discountAmount = 0;

      if (discountType === 'None') {
        discountInput.disabled = true;
      } else {
        discountInput.disabled = false;
        if (discountType === 'Percentage') {
          discountAmount = subtotal * (discountValue / 100);
        } else if (discountType === 'Exact') {
          discountAmount = discountValue;
        }
      }

      if (discountAmount > subtotal) discountAmount = subtotal;

      let totalDue = subtotal - discountAmount;
      let paidInput = document.getElementById('posPaid').value;
      let paid = parseFloat(paidInput) || 0;
      let change = paid - totalDue;
      
      document.getElementById('posSubtotal').innerText = subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('posDiscountDisplay').innerText = discountAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('posTotal').innerText = totalDue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('posChange').innerText = change >= 0 ? change.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "0.00";
      
      let isCartValid = posCart && posCart.length > 0;
      let isPaymentSufficient = Math.round(paid * 100) >= Math.round(totalDue * 100);
      
      const btn = document.getElementById('btnCheckout');
      
      if (isCartValid && isPaymentSufficient) {
        btn.disabled = false;
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-success');
      } else {
        btn.disabled = true;
      }
    } catch (e) {
      console.error("Error in POS Calculation: ", e);
    }
}

async function processSale() {
    if (posCart.length === 0) return;
    const btn = document.getElementById('btnCheckout');
    btn.innerText = "Processing...";
    btn.disabled = true;

    let subtotal = posCart.reduce((sum, item) => sum + item.totalAmount, 0);
    let discountType = document.getElementById('posDiscountType').value;
    let discountValue = parseFloat(document.getElementById('posDiscountValue').value) || 0;
    let discountAmount = 0;
    
    if (discountType === 'Percentage') {
      discountAmount = subtotal * (discountValue / 100);
    } else if (discountType === 'Exact') {
      discountAmount = discountValue;
    }
    if (discountAmount > subtotal) discountAmount = subtotal;

    let totalDue = subtotal - discountAmount;
    let paid = parseFloat(document.getElementById('posPaid').value) || 0;

    const transactionData = { 
      cart: posCart, 
      amountPaid: paid, 
      change: paid - totalDue,
      discountType: discountType,
      discountValue: discountValue,
      discountAmount: discountAmount,
      date: new Date().toLocaleString()
    };

    try {
      await api('recordSale', transactionData);
      showToast('Checkout Completed Successfully!', 'success');
      
      posCart = [];
      document.getElementById('posPaid').value = '';
      document.getElementById('posDiscountType').value = 'None';
      document.getElementById('posDiscountValue').value = '';
      document.getElementById('posDiscountValue').disabled = true;
      
      renderCart();
      await loadGlobalData(); 
      btn.innerText = "Process Checkout"; 
    } catch (error) {
      showToast('Transaction Failed: ' + error.message, 'error');
      btn.disabled = false;
      btn.innerText = "Process Checkout";
    }
}

// ==========================================
// 7. DASHBOARD & ANALYTICS
// ==========================================
function renderDashboard() {
    let totalStockUnits = 0; 
    let lowStockCount = 0;
    let today = new Date();
    let categoryCounts = {};
    let dailyTrends = {};

    let financials = {
    today: { sales: 0, profit: 0, cost: 0, expenses: 0 },
    month: { sales: 0, profit: 0, cost: 0, expenses: 0 },
    allTime: { sales: 0, profit: 0, cost: 0, expenses: 0 }
    };

    expenseData.forEach(row => {
    let dateObj = new Date(row[1]);
    let amount = parseFloat(row[4]) || 0;
    
    financials.allTime.expenses += amount;
    
    if (dateObj.toDateString() === today.toDateString()) {
        financials.today.expenses += amount;
    }
    if (dateObj.getMonth() === today.getMonth() && dateObj.getFullYear() === today.getFullYear()) {
        financials.month.expenses += amount;
    }
});

function openAddExpenseModal() {
    document.getElementById('addExpenseForm').reset();
    document.getElementById('addExpenseModal').classList.remove('hidden');
}

function closeAddExpenseModal() {
    document.getElementById('addExpenseModal').classList.add('hidden');
}

async function handleAddExpense(e) {
    e.preventDefault();
    const btn = document.getElementById('btnConfirmExpense');
    btn.innerText = "Saving...";
    btn.disabled = true;
    
    const expPayload = {
      desc: document.getElementById('expDesc').value,
      category: document.getElementById('expCategory').value,
      amount: parseFloat(document.getElementById('expAmount').value),
      date: new Date().toLocaleString()
    };

    try {
      await api('addExpenseAPI', expPayload);
      showToast('Expense recorded successfully!');
      closeAddExpenseModal();
      await loadGlobalData();
    } catch (error) {
      showToast('Error recording expense: ' + error.message, 'error');
    } finally {
      btn.innerText = "Save Expense";
      btn.disabled = false;
    }
}

function renderExpenseTable() {
    let todayExp = 0;
    let monthExp = 0;
    let todayDate = new Date();

    if (google.visualization && typeof google.visualization.arrayToDataTable === 'function') {
      let catData = [['Category', 'Products']];
      for (const [cat, count] of Object.entries(categoryCounts)) { catData.push([cat, count]); }
      if(catData.length > 1) {
        var dataPie = google.visualization.arrayToDataTable(catData);
        var optionsPie = { pieHole: 0.5, colors: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'], chartArea: {width: '90%', height: '80%'}, legend: {position: 'right'}, pieSliceBorderColor: 'transparent' };
        var chartPie = new google.visualization.PieChart(document.getElementById('chart_category'));
        chartPie.draw(dataPie, optionsPie);
      }

      let trendData = [['Date', 'Revenue']];
      last7Days.forEach(day => {
         let shortDate = day.split(' ').slice(1,3).join(' '); 
         trendData.push([shortDate, dailyTrends[day]]);
      });
      var dataBar = google.visualization.arrayToDataTable(trendData);
      var optionsBar = {
        colors: ['#4f46e5'], chartArea: {width: '85%', height: '75%'}, legend: {position: 'none'},
        vAxis: { format: '₱#,###', gridlines: {color: '#f1f5f9'}, textStyle: {color: '#64748b'} },
        hAxis: { textStyle: {color: '#64748b', bold: true} }, animation:{ startup: true, duration: 1000, easing: 'out' }
      };
      var chartBar = new google.visualization.ColumnChart(document.getElementById('chart_trends'));
      chartBar.draw(dataBar, optionsBar);
    }
}

    let html = '<table class="table-compact"><thead><tr><th>ID</th><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Logged By</th><th>Action</th></tr></thead><tbody>';
    
    if(expenseData.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;">No expenses recorded yet.</td></tr>';
    }

    // Render backwards to show newest first
    [...expenseData].reverse().forEach(row => {
        let d = new Date(row[1]);
        let amt = parseFloat(row[4]) || 0;
        
        if(d.toDateString() === todayDate.toDateString()) todayExp += amt;
        if(d.getMonth() === todayDate.getMonth() && d.getFullYear() === todayDate.getFullYear()) monthExp += amt;

        html += `<tr>
            <td><small style="color:var(--text-muted)">${row[0]}</small></td>
            <td>${row[1]}</td>
            <td><strong>${row[2]}</strong></td>
            <td><span class="status-badge" style="background: #e2e8f0; color: #475569;">${row[3]}</span></td>
            <td style="color: var(--danger); font-weight: bold;">₱${amt.toFixed(2)}</td>
            <td><small>${row[5]}</small></td>
            <td><button onclick="handleDeleteExpense('${row[0]}')" class="btn btn-sm btn-danger">Void</button></td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    
    document.getElementById('expenseTableContainer').innerHTML = html;
    document.getElementById('expToday').innerText = `₱${todayExp.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('expMonth').innerText = `₱${monthExp.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
}

async function handleDeleteExpense(id) {
    if(!confirm("Are you sure you want to void this expense?")) return;
    try {
        await api('deleteExpenseAPI', { expId: id });
        showToast("Expense voided successfully.");
        await loadGlobalData();
    } catch (e) {
        showToast(e.message, "error");
    }
}

// Calculate TRUE Net Profit (Revenue - COGS - Operational Expenses)
let trueProfitToday = financials.today.profit - financials.today.expenses;
let trueProfitMonth = financials.month.profit - financials.month.expenses;
let trueProfitAllTime = financials.allTime.profit - financials.allTime.expenses;

    let last7Days = [...Array(7)].map((_, i) => {
      let d = new Date();
      d.setDate(d.getDate() - i);
      return d.toDateString();
    }).reverse();
    
    last7Days.forEach(day => dailyTrends[day] = 0);

    inventoryData.forEach(row => {
      let stock = parseInt(row[5]) || 0;
      let threshold = parseInt(row[6]) || 0;
      let cat = row[2] || 'Uncategorized';
      
      totalStockUnits += stock;
      if (stock <= threshold) lowStockCount++;
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    recentSalesData.forEach(row => {
      if (row[9] === 'Voided') return; 
      
      let dateObj = new Date(row[1]);
      let totalSales = parseFloat(row[5]) || 0; 
      let totalProfit = parseFloat(row[8]) || 0; 
      let totalCost = totalSales - totalProfit; 

      financials.allTime.sales += totalSales;
      financials.allTime.profit += totalProfit;
      financials.allTime.cost += totalCost;

      if (dateObj.toDateString() === today.toDateString()) {
        financials.today.sales += totalSales;
        financials.today.profit += totalProfit;
        financials.today.cost += totalCost;
      }
      
      if (dateObj.getMonth() === today.getMonth() && dateObj.getFullYear() === today.getFullYear()) {
        financials.month.sales += totalSales;
        financials.month.profit += totalProfit;
        financials.month.cost += totalCost;
      }
      
      let dateString = dateObj.toDateString();
      if (dailyTrends[dateString] !== undefined) dailyTrends[dateString] += totalSales;
    });

    document.getElementById('kpi-container').innerHTML = `
      <div class="kpi-card"><div class="kpi-title">Today's Revenue</div><div class="kpi-value" style="color: var(--success)">₱${financials.today.sales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div></div>
      <div class="kpi-card"><div class="kpi-title">Monthly Revenue</div><div class="kpi-value">₱${financials.month.sales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div></div>
      <div class="kpi-card"><div class="kpi-title">Items in Stock</div><div class="kpi-value">${totalStockUnits}</div></div>
      <div class="kpi-card ${lowStockCount > 0 ? 'alert' : ''}"><div class="kpi-title">Low Stock Alerts</div><div class="kpi-value">${lowStockCount}</div></div>
    `;

    const formatCurrency = (val) => '₱' + val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const calcMargin = (profit, sales) => sales > 0 ? ((profit / sales) * 100).toFixed(1) + '%' : '0.0%';

    let reportBody = document.getElementById('financialReportBody');
    if (reportBody) {
      reportBody.innerHTML = `
        <tr>
          <td><strong>Today</strong></td>
          <td>${formatCurrency(financials.today.sales)}</td>
          <td style="color: var(--danger)">${formatCurrency(financials.today.cost)}</td>
          <td style="color: var(--success)"><strong>${formatCurrency(financials.today.profit)}</strong></td>
          <td><span class="status-badge" style="background: #e0e7ff; color: #3730a3;">${calcMargin(financials.today.profit, financials.today.sales)}</span></td>
        </tr>
        <tr>
          <td><strong>This Month</strong></td>
          <td>${formatCurrency(financials.month.sales)}</td>
          <td style="color: var(--danger)">${formatCurrency(financials.month.cost)}</td>
          <td style="color: var(--success)"><strong>${formatCurrency(financials.month.profit)}</strong></td>
          <td><span class="status-badge" style="background: #e0e7ff; color: #3730a3;">${calcMargin(financials.month.profit, financials.month.sales)}</span></td>
        </tr>
        <tr style="background-color: #f8fafc; border-top: 2px solid #e2e8f0;">
          <td><strong>All-Time</strong></td>
          <td><strong>${formatCurrency(financials.allTime.sales)}</strong></td>
          <td style="color: var(--danger)"><strong>${formatCurrency(financials.allTime.cost)}</strong></td>
          <td style="color: var(--success)"><strong>${formatCurrency(financials.allTime.profit)}</strong></td>
          <td><span class="status-badge" style="background: #e0e7ff; color: #3730a3;">${calcMargin(financials.allTime.profit, financials.allTime.sales)}</span></td>
        </tr>
      `;
    }

// ==========================================
// 8. HISTORY & RECENT SALES
// ==========================================
function renderRecentSales() {
    const todayString = new Date().toDateString();
    let groupedSales = {};

    recentSalesData.forEach(row => {
      let rowDate = new Date(row[1]);
      if (rowDate.toDateString() === todayString) {
        const txnId = row[0];
        
        if (!groupedSales[txnId]) {
          groupedSales[txnId] = {
            items: [],
            total: 0,
            amountPaid: 0,
            change: 0,
            status: row[9]
          };
        }
        
        groupedSales[txnId].items.push(row);
        
        if (row[9] !== 'Voided') {
          groupedSales[txnId].total += parseFloat(row[5]) || 0;
        }

        if (parseFloat(row[6]) > 0) groupedSales[txnId].amountPaid = parseFloat(row[6]);
        if (parseFloat(row[7]) !== 0 && groupedSales[txnId].change === 0) groupedSales[txnId].change = parseFloat(row[7]);
      }
    });

    let html = '<table class="table-compact"><thead><tr><th>Txn ID</th><th>Items</th><th>Financials</th><th>Status</th><th>Action</th></tr></thead><tbody>';
    
    Object.keys(groupedSales).forEach(txnId => {
      const sale = groupedSales[txnId];
      
      let itemsHtml = sale.items.map(item => {
        const isItemVoided = item[9] === 'Voided';
        return `<div style="margin-bottom: 5px; ${isItemVoided ? 'text-decoration: line-through; opacity: 0.5;' : ''}">
                  ${item[2]} (x${item[4]}) 
                  ${!isItemVoided ? `<button onclick="handleVoidItem('${txnId}', '${item[3]}')" class="btn-sm btn-danger" style="padding: 2px 5px; font-size: 0.7rem;">Void Item</button>` : ''}
                </div>`;
      }).join('');

      let financialsHtml = `
        <div style="line-height: 1.4;">
          <span style="color: var(--text-muted);">Due: ₱${sale.total.toFixed(2)}</span><br>
          <strong style="color: var(--success);">Paid: ₱${sale.amountPaid.toFixed(2)}</strong><br>
          <small style="color: var(--text-muted);">Change: ₱${sale.change.toFixed(2)}</small>
        </div>
      `;

      html += `<tr>
                <td><small>${txnId}</small></td>
                <td>${itemsHtml}</td>
                <td>${financialsHtml}</td>
                <td><span class="status-badge ${sale.status === 'Voided' ? 'status-voided' : 'status-good'}">${sale.status}</span></td>
                <td><button onclick="handleVoidSale('${txnId}')" class="btn btn-sm btn-danger">Void All</button></td>
              </tr>`;
    });

    if (Object.keys(groupedSales).length === 0) {
      html += '<tr><td colspan="5" style="text-align:center; padding: 15px; color: var(--text-muted);">No transactions yet today.</td></tr>';
    }

    document.getElementById('recentSalesContainer').innerHTML = html + '</tbody></table>';
}

async function handleVoidItem(txnId, itemId) {
    if (!confirm("Void this specific item?")) return;
    try {
      await api('voidItemAPI', { txnId: txnId, itemId: itemId });
      showToast("Item voided!");
      await loadGlobalData();
    } catch (e) {
      showToast(e.message, "error");
    }
}

async function handleVoidSale(txnId) {
    if (!confirm(`Are you sure you want to void transaction ${txnId}? This will reverse the sale and restore inventory stock.`)) return;
    
    try {
      await api('voidSaleAPI', { txnId: txnId });
      showToast(`Transaction ${txnId} voided successfully!`, 'success');
      await loadGlobalData(); 
    } catch (error) {
      showToast('Error voiding sale: ' + error.message, 'error');
    }
}

function renderHistoryTable() {
    const container = document.getElementById('historyTableContainer');
    if(recentSalesData.length === 0) {
      container.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No historical data found.</p>';
      return;
    }

    let historyTree = {};
    recentSalesData.forEach(row => {
      let dateObj = new Date(row[1]);
      let year = dateObj.getFullYear();
      let month = dateObj.toLocaleString('default', { month: 'long' }); 
      let day = dateObj.toLocaleDateString();

      if (!historyTree[year]) historyTree[year] = {};
      if (!historyTree[year][month]) historyTree[year][month] = {};
      if (!historyTree[year][month][day]) historyTree[year][month][day] = [];
      historyTree[year][month][day].push(row);
    });

    let html = '';
    for (const year in historyTree) {
      html += `<details class="history-year" open><summary>${year}</summary>`;
      for (const month in historyTree[year]) {
        html += `<details class="history-month"><summary>${month}</summary>`;
        for (const day in historyTree[year][month]) {
          html += `<details class="history-day"><summary>${day}</summary>
            <div class="table-container" style="margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <table class="table-compact">
                <thead><tr><th>Txn ID</th><th>Item</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>`;
          
          historyTree[year][month][day].forEach(row => {
            let currentStatus = row[9] || 'Completed'; 
            let isVoided = currentStatus === 'Voided';
            let rowClass = isVoided ? 'style="opacity: 0.6;"' : '';
            let badgeClass = isVoided ? 'status-voided' : 'status-good';
            
            html += `<tr ${rowClass}>
              <td><small>${row[0]}</small></td>
              <td><strong>${row[2]}</strong></td>
              <td>${row[4]}</td> 
              <td>₱${(parseFloat(row[5]) || 0).toFixed(2)}</td> 
              <td><span class="status-badge ${badgeClass}">${currentStatus}</span></td>
            </tr>`;
          });
          html += `</tbody></table></div></details>`;
        }
        html += `</details>`;
      }
      html += `</details>`;
    }
    container.innerHTML = html;
}

// ==========================================
// 9. MODALS & NAVIGATION
// ==========================================
function openRecentSalesModal() {
    document.getElementById('recentSalesModal').classList.remove('hidden');
}

function closeRecentSalesModal() {
    document.getElementById('recentSalesModal').classList.add('hidden');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tabs button, .bottom-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    let desktopBtn = document.getElementById('tab-' + tabId);
    let mobileBtn = document.getElementById('mob-' + tabId);
    if (desktopBtn) desktopBtn.classList.add('active');
    if (mobileBtn) mobileBtn.classList.add('active');
    
    if (tabId === 'dashboard' && typeof renderDashboard === 'function') {
      setTimeout(renderDashboard, 50); 
    }
}
