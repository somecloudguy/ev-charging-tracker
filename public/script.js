// Global state
let chargeData = [];
let rangeChart = null;
let costChart = null;

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

// Tab navigation
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabName + 'Tab');
    });
    
    if (tabName === 'insights') {
        loadInsights();
    } else if (tabName === 'history') {
        loadHistory();
    }
}

// Settings
function toggleSettings() {
    document.getElementById('settingsPanel').classList.toggle('hidden');
}

function saveSettings() {
    const capacity = document.getElementById('batteryCapacity').value;
    if (capacity && capacity > 0) {
        localStorage.setItem('batteryCapacity', capacity);
        toggleSettings();
        showToast('Settings saved!', 'success');
        loadInsights();
    } else {
        showToast('Invalid battery capacity', 'error');
    }
}

function getBatteryCapacity() {
    return parseFloat(localStorage.getItem('batteryCapacity')) || 30;
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
            loadInsights();
            loadHistory();
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Load insights with calculations
function loadInsights() {
    const sortOrder = document.getElementById('insightsSort').value;
    const batteryCapacity = getBatteryCapacity();
    
    let sortedData = [...chargeData].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const insights = [];
    for (let i = 0; i < sortedData.length; i++) {
        const current = sortedData[i];
        const previous = i > 0 ? sortedData[i - 1] : null;
        
        const kmRun = previous ? current.odometer - previous.odometer : 0;
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
        
        const chargingSpeed = current.timeToCharge > 0 
            ? current.kwhUsed / current.timeToCharge 
            : 0;
        
        insights.push({
            ...current,
            kmRun,
            percentUsed,
            estimatedRange,
            kwhConsumed,
            costPerKm,
            chargingSpeed
        });
    }
    
    const displayData = sortOrder === 'newest' ? insights.reverse() : insights;
    const validInsights = displayData.filter(i => i.kmRun > 0);
    
    const container = document.getElementById('insightsList');
    
    if (validInsights.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📊</div>
                <p>Add at least 2 charging cycles to see insights</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = validInsights.map(insight => {
        const rangeClass = insight.estimatedRange > 200 ? 'good' : (insight.estimatedRange < 160 ? 'bad' : '');
        const costClass = insight.costPerKm > 3 ? 'bad' : 'good';
        const speedClass = insight.chargingSpeed > 4 ? 'bad' : 'good';
        
        return `
            <div class="insight-card">
                <div class="date">📅 ${formatDate(insight.date)}</div>
                <div class="metrics">
                    <div class="metric ${rangeClass}">
                        <div class="value">${insight.estimatedRange.toFixed(0)}</div>
                        <div class="label">Est. Range (km)</div>
                    </div>
                    <div class="metric ${costClass}">
                        <div class="value">₹${insight.costPerKm.toFixed(2)}</div>
                        <div class="label">Cost/km</div>
                    </div>
                    <div class="metric ${speedClass}">
                        <div class="value">${insight.chargingSpeed.toFixed(1)}</div>
                        <div class="label">Speed (kW)</div>
                    </div>
                    <div class="metric">
                        <div class="value">${insight.kmRun.toFixed(0)}</div>
                        <div class="label">km Run</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    updateCharts(validInsights.reverse());
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
                <div class="icon">📋</div>
                <p>No charging history yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = sortedData.map(charge => `
        <div class="history-card">
            <div class="header-row">
                <span class="date">📅 ${formatDate(charge.date)}</span>
                <span class="type ${charge.chargeType?.toLowerCase()}">${charge.chargeType || 'Slow'}</span>
                <button class="delete-btn" onclick="deleteCharge('${charge.id}')">🗑️</button>
            </div>
            <div class="details">
                <div class="detail-item">
                    <strong>${charge.startPercent}% → ${charge.endPercent}%</strong>
                    <span>Battery</span>
                </div>
                <div class="detail-item">
                    <strong>${charge.kwhUsed} kWh</strong>
                    <span>Charged</span>
                </div>
                <div class="detail-item">
                    <strong>₹${charge.costPerKwh}</strong>
                    <span>per kWh</span>
                </div>
                <div class="detail-item">
                    <strong>${charge.timeToCharge}h</strong>
                    <span>Duration</span>
                </div>
                <div class="detail-item">
                    <strong>${charge.odometer} km</strong>
                    <span>Odometer</span>
                </div>
                <div class="detail-item">
                    <strong>₹${(charge.kwhUsed * charge.costPerKwh).toFixed(0)}</strong>
                    <span>Total Cost</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Update charts
function updateCharts(data) {
    if (data.length < 2) return;
    
    const labels = data.map(d => formatDate(d.date, true));
    const rangeData = data.map(d => d.estimatedRange);
    const costData = data.map(d => d.costPerKm);
    
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { color: '#B0B0B0', maxRotation: 45 }, grid: { color: '#3D3D3D' } },
            y: { ticks: { color: '#B0B0B0' }, grid: { color: '#3D3D3D' } }
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
                backgroundColor: rangeData.map(v => v > 200 ? '#4CAF50' : (v < 160 ? '#f44336' : '#FF9800')),
                borderRadius: 4
            }]
        },
        options: { ...chartOptions, plugins: { ...chartOptions.plugins, title: { display: true, text: 'Estimated Range', color: '#fff' } } }
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
                backgroundColor: costData.map(v => v > 3 ? '#f44336' : '#4CAF50'),
                borderRadius: 4
            }]
        },
        options: { ...chartOptions, plugins: { ...chartOptions.plugins, title: { display: true, text: 'Cost per km', color: '#fff' } } }
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
