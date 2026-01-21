// Global state
let chargeData = [];
let rangeChart = null;
let costChart = null;
let carLocked = true;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initApp();
});

function initApp() {
    // Load battery capacity from localStorage
    const savedCapacity = localStorage.getItem('batteryCapacity');
    if (savedCapacity) {
        document.getElementById('batteryCapacity').value = savedCapacity;
    }
    
    // Set default date to today
    document.getElementById('date').valueAsDate = new Date();
    
    // Setup form handler
    document.getElementById('chargeForm').addEventListener('submit', handleFormSubmit);
    
    // Load data
    loadAllData();
}

// Sidebar navigation
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

function switchSection(sectionName) {
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionName);
    });
    
    // Update sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.toggle('active', section.id === sectionName + 'Section');
    });
    
    // Close sidebar
    toggleSidebar();
    
    // Load section-specific data
    if (sectionName === 'charging') {
        updateCharts(getValidInsights());
        loadInsights();
        loadHistory();
    }
}

// Charging sub-tabs
function switchChargingTab(tabName) {
    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.charging-tab').forEach(content => {
        content.classList.toggle('active', content.id === tabName + 'Tab');
    });
    
    if (tabName === 'journeys') {
        loadInsights();
    } else if (tabName === 'history') {
        loadHistory();
    } else if (tabName === 'home') {
        updateCharts(getValidInsights());
    }
}

// Quick actions (dummy functionality)
function toggleCarLock() {
    carLocked = !carLocked;
    document.getElementById('lockIcon').textContent = carLocked ? '🔒' : '🔓';
    document.getElementById('lockLabel').textContent = carLocked ? 'Locked' : 'Unlocked';
    showToast(carLocked ? '🔒 Car locked' : '🔓 Car unlocked', 'success');
}

function toggleClimate() {
    showToast('❄️ Climate control: Cooling to 22°C', 'success');
}

function honkHorn() {
    showToast('📢 Horn activated', 'success');
}

function flashLights() {
    showToast('💡 Lights flashed', 'success');
}

// Settings
function saveSettings() {
    const capacity = document.getElementById('batteryCapacity').value;
    if (capacity && capacity > 0) {
        localStorage.setItem('batteryCapacity', capacity);
        showToast('Settings saved!', 'success');
        loadInsights();
    } else {
        showToast('Invalid battery capacity', 'error');
    }
}

function getBatteryCapacity() {
    return parseFloat(localStorage.getItem('batteryCapacity')) || 40.5;
}

// Form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const data = {
        date: document.getElementById('date').value,
        odometer: parseFloat(document.getElementById('odometer').value),
        startPercent: parseFloat(document.getElementById('startPercent').value),
        endPercent: parseFloat(document.getElementById('endPercent').value),
        timeToCharge: parseFloat(document.getElementById('timeToCharge').value),
        kwhUsed: parseFloat(document.getElementById('kwhUsed').value),
        costPerKwh: parseFloat(document.getElementById('costPerKwh').value),
        chargeType: document.getElementById('chargeType').value
    };
    
    if (data.endPercent <= data.startPercent) {
        showToast('End % must be greater than Start %', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/charges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast('✓ Charge saved!', 'success');
            document.getElementById('chargeForm').reset();
            document.getElementById('date').valueAsDate = new Date();
            loadAllData();
        } else {
            const error = await response.json();
            showToast('Server error: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Network error. Please try again.', 'error');
    }
}

// Load all data
async function loadAllData() {
    try {
        const response = await fetch('/api/charges');
        if (response.ok) {
            chargeData = await response.json();
            updateCharts(getValidInsights());
            loadInsights();
            loadHistory();
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Get valid insights for charts
function getValidInsights() {
    const batteryCapacity = getBatteryCapacity();
    let sortedData = [...chargeData].sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) return dateDiff;
        return a.odometer - b.odometer;
    });
    
    const insights = [];
    for (let i = 0; i < sortedData.length; i++) {
        const current = sortedData[i];
        const previous = i > 0 ? sortedData[i - 1] : null;
        
        const kmRun = previous ? current.odometer - previous.odometer : 0;
        const startOdometer = previous ? previous.odometer : 0;
        const endOdometer = current.odometer;
        const percentUsed = previous ? previous.endPercent - current.startPercent : 0;
        
        let estimatedRange = 0;
        if (percentUsed > 0) {
            estimatedRange = (kmRun / percentUsed) * 100;
        }
        
        const kwhConsumed = (percentUsed / 100) * batteryCapacity;
        const costPerKwh = previous ? previous.costPerKwh : current.costPerKwh;
        
        let costPerKm = 0;
        if (kmRun > 0 && kwhConsumed > 0) {
            costPerKm = (kwhConsumed * costPerKwh) / kmRun;
        }
        
        if (kmRun > 0) {
            insights.push({
                ...current,
                kmRun,
                startOdometer,
                endOdometer,
                percentUsed,
                estimatedRange,
                kwhConsumed,
                costPerKm
            });
        }
    }
    return insights;
}

// Load insights with calculations
function loadInsights() {
    const sortOrder = document.getElementById('insightsSort').value;
    const batteryCapacity = getBatteryCapacity();
    
    // Sort by date first, then by odometer for same-day charges
    let sortedData = [...chargeData].sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) return dateDiff;
        return a.odometer - b.odometer;
    });
    
    const insights = [];
    for (let i = 0; i < sortedData.length; i++) {
        const current = sortedData[i];
        const previous = i > 0 ? sortedData[i - 1] : null;
        
        const kmRun = previous ? current.odometer - previous.odometer : 0;
        const startOdometer = previous ? previous.odometer : 0;
        const endOdometer = current.odometer;
        const percentUsed = previous ? previous.endPercent - current.startPercent : 0;
        
        let estimatedRange = 0;
        if (percentUsed > 0) {
            estimatedRange = (kmRun / percentUsed) * 100;
        }
        
        const kwhConsumed = (percentUsed / 100) * batteryCapacity;
        const costPerKwh = previous ? previous.costPerKwh : current.costPerKwh;
        
        let costPerKm = 0;
        if (kmRun > 0 && kwhConsumed > 0) {
            costPerKm = (kwhConsumed * costPerKwh) / kmRun;
        }
        
        insights.push({
            ...current,
            kmRun,
            startOdometer,
            endOdometer,
            percentUsed,
            estimatedRange,
            kwhConsumed,
            costPerKm
        });
    }
    
    const displayData = sortOrder === 'newest' ? insights.reverse() : insights;
    const validInsights = displayData.filter(i => i.kmRun > 0);
    
    const container = document.getElementById('insightsList');
    
    if (validInsights.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">🚗</div>
                <p>Add at least 2 charging sessions to see journey insights</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = validInsights.map(insight => {
        const rangeClass = insight.estimatedRange > 200 ? 'good' : (insight.estimatedRange < 160 ? 'bad' : '');
        const costClass = insight.costPerKm > 3 ? 'bad' : 'good';
        
        return `
            <div class="insight-card">
                <div class="date">📅 ${formatDate(insight.date)}</div>
                <div class="odometer-range">
                    🚗 ${insight.startOdometer.toLocaleString()} km <span class="arrow">→</span> ${insight.endOdometer.toLocaleString()} km
                </div>
                <div class="metrics">
                    <div class="metric ${rangeClass}">
                        <div class="value">${insight.estimatedRange.toFixed(0)}</div>
                        <div class="label">Est. Range (km)</div>
                    </div>
                    <div class="metric ${costClass}">
                        <div class="value">₹${insight.costPerKm.toFixed(2)}</div>
                        <div class="label">Cost/km</div>
                    </div>
                    <div class="metric">
                        <div class="value">${insight.kmRun.toFixed(0)}</div>
                        <div class="label">km Run</div>
                    </div>
                    <div class="metric">
                        <div class="value">${insight.percentUsed.toFixed(0)}%</div>
                        <div class="label">Battery Used</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Load history
function loadHistory() {
    const sortOrder = document.getElementById('historySort').value;
    
    let sortedData = [...chargeData].sort((a, b) => {
        return sortOrder === 'newest' 
            ? new Date(b.date) - new Date(a.date)
            : new Date(a.date) - new Date(b.date);
    });
    
    const container = document.getElementById('historyList');
    
    if (sortedData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">🔌</div>
                <p>No charging history yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = sortedData.map(charge => {
        const chargingSpeed = parseFloat(charge.timeToCharge) > 0 
            ? (parseFloat(charge.kwhUsed) / parseFloat(charge.timeToCharge)).toFixed(1) 
            : '—';
        
        return `
            <div class="history-card">
                <div class="header-row">
                    <span class="date">📅 ${formatDate(charge.date)}</span>
                    <div class="badges">
                        <span class="type ${charge.chargeType?.toLowerCase()}">${charge.chargeType || 'Slow'}</span>
                        <span class="speed-badge">⚡ ${chargingSpeed} kW</span>
                    </div>
                    <button class="delete-btn" onclick="deleteCharge('${charge.id}')">🗑️</button>
                </div>
                <div class="details">
                    <div class="detail-item">
                        <strong>${Math.round(charge.startPercent)}% → ${Math.round(charge.endPercent)}%</strong>
                        <span>Battery</span>
                    </div>
                    <div class="detail-item">
                        <strong>${parseFloat(charge.kwhUsed).toFixed(1)} kWh</strong>
                        <span>Charged</span>
                    </div>
                    <div class="detail-item">
                        <strong>₹${parseFloat(charge.costPerKwh).toFixed(2)}</strong>
                        <span>per kWh</span>
                    </div>
                    <div class="detail-item">
                        <strong>${parseFloat(charge.timeToCharge).toFixed(1)}h</strong>
                        <span>Duration</span>
                    </div>
                    <div class="detail-item">
                        <strong>${Math.round(charge.odometer).toLocaleString()} km</strong>
                        <span>Odometer</span>
                    </div>
                    <div class="detail-item">
                        <strong>₹${(parseFloat(charge.kwhUsed) * parseFloat(charge.costPerKwh)).toFixed(0)}</strong>
                        <span>Total Cost</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Update charts
function updateCharts(data) {
    if (data.length < 2) return;
    
    const labels = data.map(d => formatDate(d.date, true));
    const rangeData = data.map(d => Math.round(d.estimatedRange));
    const costData = data.map(d => parseFloat(d.costPerKm.toFixed(2)));
    
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { color: '#94a3b8', maxRotation: 45 }, grid: { color: '#334155' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
        }
    };
    
    const rangeCtx = document.getElementById('rangeChart').getContext('2d');
    if (rangeChart) rangeChart.destroy();
    rangeChart = new Chart(rangeCtx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Est. Range (km)',
                data: rangeData,
                backgroundColor: rangeData.map(v => v > 200 ? '#10b981' : (v < 160 ? '#ef4444' : '#f59e0b')),
                borderRadius: 6
            }]
        },
        options: { ...chartOptions, plugins: { ...chartOptions.plugins, title: { display: true, text: 'Estimated Range (km)', color: '#f8fafc', font: { size: 14, weight: '600' } } } }
    });
    
    const costCtx = document.getElementById('costChart').getContext('2d');
    if (costChart) costChart.destroy();
    costChart = new Chart(costCtx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Cost/km (₹)',
                data: costData,
                backgroundColor: costData.map(v => v > 3 ? '#ef4444' : '#10b981'),
                borderRadius: 6
            }]
        },
        options: { ...chartOptions, plugins: { ...chartOptions.plugins, title: { display: true, text: 'Cost per km (₹)', color: '#f8fafc', font: { size: 14, weight: '600' } } } }
    });
}

// Delete charge
async function deleteCharge(id) {
    if (!confirm('Delete this charging record?')) return;
    
    try {
        const response = await fetch(`/api/charges/${id}`, { method: 'DELETE' });
        
        if (response.ok) {
            showToast('Record deleted', 'success');
            loadAllData();
        } else {
            showToast('Error deleting record', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Network error', 'error');
    }
}

// Delete all data
async function deleteAllData() {
    if (!confirm('Delete ALL charging data? This cannot be undone!')) return;
    if (!confirm('Are you really sure?')) return;
    
    try {
        const response = await fetch('/api/charges', { method: 'DELETE' });
        
        if (response.ok) {
            chargeData = [];
            loadInsights();
            loadHistory();
            showToast('All data deleted', 'success');
        } else {
            showToast('Error deleting data', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Network error', 'error');
    }
}

// Export data
function exportData() {
    const dataStr = JSON.stringify(chargeData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ev-charging-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported!', 'success');
}

// Import from Excel
async function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    showToast('Reading Excel file...', 'success');
    
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        if (rows.length < 2) {
            showToast('Excel file is empty', 'error');
            return;
        }
        
        // Get header row and normalize column names
        const headers = rows[0].map(h => String(h).toLowerCase().trim().replace(/_/g, ' '));
        
        // Map column indices based on header names
        const colMap = {
            date: findColumn(headers, ['date', 'charging date']),
            startPercent: findColumn(headers, ['start percent', 'start %', 'start', 'startsoc']),
            endPercent: findColumn(headers, ['end percent', 'end %', 'end', 'endsoc']),
            chargeType: findColumn(headers, ['charge type', 'type', 'mode']),
            timeToCharge: findColumn(headers, ['time to charge', 'time', 'hours', 'duration']),
            kwhUsed: findColumn(headers, ['kwh used', 'kwh', 'energy', 'units']),
            costPerKwh: findColumn(headers, ['cost per kwh', 'cost', 'rate', 'price']),
            odometer: findColumn(headers, ['odometer', 'odo', 'km', 'mileage'])
        };
        
        console.log('Column mapping:', colMap);
        console.log('Headers found:', headers);
        
        // Process data rows
        const charges = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 3) continue;
            
            // Parse date
            let dateValue = colMap.date >= 0 ? row[colMap.date] : row[0];
            if (typeof dateValue === 'number') {
                const date = new Date((dateValue - 25569) * 86400 * 1000);
                dateValue = date.toISOString().split('T')[0];
            } else if (dateValue instanceof Date) {
                dateValue = dateValue.toISOString().split('T')[0];
            } else if (typeof dateValue === 'string') {
                const parsed = new Date(dateValue);
                if (!isNaN(parsed)) {
                    dateValue = parsed.toISOString().split('T')[0];
                }
            }
            
            const getValue = (col, defaultVal = 0) => {
                if (col < 0 || col >= row.length) return defaultVal;
                const val = parseFloat(row[col]);
                return isNaN(val) ? defaultVal : val;
            };
            
            // Parse time in H:MM or HH:MM format (e.g., "8:30" = 8.5 hours)
            const parseTime = (col) => {
                if (col < 0 || col >= row.length) return 0;
                const val = row[col];
                if (typeof val === 'string' && val.includes(':')) {
                    const parts = val.split(':');
                    const hours = parseInt(parts[0]) || 0;
                    const minutes = parseInt(parts[1]) || 0;
                    return hours + (minutes / 60);
                }
                // If it's a decimal from Excel (time as fraction of day)
                if (typeof val === 'number' && val < 1) {
                    return val * 24; // Convert fraction of day to hours
                }
                return parseFloat(val) || 0;
            };
            
            const charge = {
                date: dateValue,
                odometer: getValue(colMap.odometer),
                startPercent: getValue(colMap.startPercent),
                endPercent: getValue(colMap.endPercent),
                timeToCharge: parseTime(colMap.timeToCharge),
                kwhUsed: getValue(colMap.kwhUsed),
                costPerKwh: getValue(colMap.costPerKwh),
                chargeType: colMap.chargeType >= 0 ? (row[colMap.chargeType] || 'Slow') : 'Slow'
            };
            
            // Validate - must have date and at least some valid data
            if (charge.date && (charge.odometer > 0 || charge.kwhUsed > 0)) {
                charges.push(charge);
            }
        }
        
        if (charges.length === 0) {
            showToast('No valid data found in Excel', 'error');
            return;
        }
        
        // Upload each charge to the API
        showToast(`Importing ${charges.length} records...`, 'success');
        let imported = 0;
        
        for (const charge of charges) {
            try {
                const response = await fetch('/api/charges', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(charge)
                });
                if (response.ok) imported++;
            } catch (err) {
                console.error('Failed to import:', charge, err);
            }
        }
        
        showToast(`✓ Imported ${imported} of ${charges.length} records!`, 'success');
        document.getElementById('excelFile').value = '';
        toggleSettings();
        loadAllData();
        
    } catch (error) {
        console.error('Excel import error:', error);
        showToast('Error reading Excel file', 'error');
    }
}

// Helper to find column index by possible header names
function findColumn(headers, possibleNames) {
    for (const name of possibleNames) {
        const idx = headers.findIndex(h => h.includes(name));
        if (idx >= 0) return idx;
    }
    return -1;
}

// Utility functions
function formatDate(dateStr, short = false) {
    const date = new Date(dateStr);
    if (short) {
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
