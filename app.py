import streamlit as st
import json
import os
from datetime import datetime
import pandas as pd

# Constants
DATA_FILE = 'charging_data.json'
DEFAULT_BATTERY_CAPACITY = 30.0

# --- Data Functions ---
@st.cache_data
def load_data():
    """Load charging data from JSON file."""
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return []

def save_data(data):
    """Save charging data to JSON file and clear cache."""
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)
    load_data.clear()

def calculate_insights(data, battery_capacity):
    """Calculate insights between consecutive charging cycles."""
    if len(data) < 2:
        return []
    
    # Sort by odometer descending (latest first)
    sorted_data = sorted(data, key=lambda x: x['odometer'], reverse=True)
    insights = []
    
    for i in range(len(sorted_data) - 1):
        prev_charge = sorted_data[i + 1]  # Lower odometer
        curr_charge = sorted_data[i]      # Higher odometer
        
        km_run = curr_charge['odometer'] - prev_charge['odometer']
        percent_used = prev_charge['end_percent'] - curr_charge['start_percent']
        
        # Calculate energy consumed during trip based on battery capacity
        kwh_consumed = (percent_used / 100) * battery_capacity
        # Use cost from previous charge (that's what powered this trip)
        cost_per_kwh = prev_charge['cost_per_kwh']
        total_cost = kwh_consumed * cost_per_kwh
        
        # Calculate estimated full range (100% battery)
        estimated_range = (km_run / percent_used) * 100 if percent_used > 0 else 0
        
        insights.append({
            'Start Date': prev_charge['date'],
            'End Date': curr_charge['date'],
            'Start %': prev_charge['end_percent'],
            'End %': curr_charge['start_percent'],
            'KM Run': int(km_run),
            'kWh Used': round(kwh_consumed, 2),
            'Est. Range (km)': int(estimated_range),
            'Cost/km (₹)': round(total_cost / km_run, 2) if km_run > 0 else 0
        })
    
    return insights

# --- App Configuration ---
st.set_page_config(page_title="EV Charging Tracker", page_icon="🔋")
st.title("🔋 EV Charging Tracker")

# Initialize session state
if 'battery_capacity' not in st.session_state:
    st.session_state.battery_capacity = DEFAULT_BATTERY_CAPACITY

# --- Sidebar Settings ---
with st.sidebar:
    st.header("⚙️ Settings")
    new_capacity = st.number_input(
        "Battery Capacity (kWh)", 
        min_value=0.1, 
        step=0.1, 
        value=st.session_state.battery_capacity
    )
    if new_capacity != st.session_state.battery_capacity:
        st.session_state.battery_capacity = new_capacity
        st.success("Battery capacity updated!")
    
    st.divider()
    st.caption(f"Current capacity: {st.session_state.battery_capacity} kWh")
    
    # --- Import Excel Data ---
    st.divider()
    st.header("📥 Import Data")
    st.caption("Excel columns required: date, start_percent, end_percent, charge_type, time_to_charge, kwh_used, cost_per_kwh, odometer")
    
    uploaded_file = st.file_uploader("Upload Excel file", type=['xlsx', 'xls'])
    if uploaded_file is not None:
        try:
            import_df = pd.read_excel(uploaded_file)
            st.write(f"Found {len(import_df)} rows")
            
            if st.button("Import Data", type="primary"):
                existing_data = load_data()
                imported_count = 0
                
                for _, row in import_df.iterrows():
                    # Handle time_to_charge - could be time object (2:30) or float (2.5)
                    time_val = row.get('time_to_charge', 0)
                    if hasattr(time_val, 'hour'):  # It's a datetime.time object
                        time_to_charge = time_val.hour + time_val.minute / 60
                    else:
                        time_to_charge = float(time_val) if time_val else 0
                    
                    # Handle date - could be datetime, extract just date part
                    date_val = row.get('date', '')
                    if hasattr(date_val, 'strftime'):
                        date_str = date_val.strftime('%Y-%m-%d')
                    else:
                        date_str = str(date_val).split(' ')[0]  # Remove time portion
                    
                    charge = {
                        'id': str(datetime.now().timestamp() + imported_count),
                        'date': date_str,
                        'start_percent': int(row.get('start_percent', 0)),
                        'end_percent': int(row.get('end_percent', 0)),
                        'charge_type': str(row.get('charge_type', 'Slow')),
                        'time_to_charge': time_to_charge,
                        'kwh_used': float(row.get('kwh_used', 0)),
                        'cost_per_kwh': float(row.get('cost_per_kwh', 0)),
                        'odometer': int(row.get('odometer', 0))
                    }
                    existing_data.append(charge)
                    imported_count += 1
                
                save_data(existing_data)
                st.success(f"✅ Imported {imported_count} records!")
                st.rerun()
        except Exception as e:
            st.error(f"Error reading file: {e}")

# --- Load Data Once ---
data = load_data()

# --- Add Charging Cycle ---
st.header("➕ Add Charging Cycle")
with st.form("charge_form", clear_on_submit=True):
    col1, col2 = st.columns(2)
    with col1:
        date = st.date_input("Date")
        start_percent = st.number_input("Start %", min_value=0, max_value=100)
        end_percent = st.number_input("End %", min_value=0, max_value=100)
        charge_type = st.radio("Charge Type", ["Slow", "Fast"], horizontal=True)
    with col2:
        time_to_charge = st.number_input("Time to Charge (hours)", min_value=0.0, step=0.1)
        kwh_used = st.number_input("kWh Used", min_value=0.0, step=0.1)
        cost_per_kwh = st.number_input("Cost per kWh", min_value=0.0, step=0.01)
        odometer = st.number_input("Odometer Reading (km)", min_value=0, step=1)
    
    submitted = st.form_submit_button("💾 Save Charge", use_container_width=True)
    
    if submitted:
        charge = {
            'id': str(datetime.now().timestamp()),
            'date': str(date),
            'start_percent': start_percent,
            'end_percent': end_percent,
            'charge_type': charge_type,
            'time_to_charge': time_to_charge,
            'kwh_used': kwh_used,
            'cost_per_kwh': cost_per_kwh,
            'odometer': odometer
        }
        data.append(charge)
        save_data(data)
        st.success("✅ Charge saved!")
        st.rerun()

# --- Charging Insights ---
st.header("📊 Charging Insights")
insights = calculate_insights(data, st.session_state.battery_capacity)
if insights:
    col_sort1, col_space1 = st.columns([1, 3])
    with col_sort1:
        insights_order = st.selectbox("Sort by", ["Newest first", "Oldest first"], key="insights_sort")
    
    df = pd.DataFrame(insights)
    if insights_order == "Oldest first":
        df = df.iloc[::-1].reset_index(drop=True)
    
    def highlight_range(val):
        if val > 200:
            return 'color: green'
        elif val < 160:
            return 'color: red'
        return ''
    
    def highlight_cost(val):
        if val > 3:
            return 'color: red'
        return ''
    
    styled_df = df.style.applymap(highlight_range, subset=['Est. Range (km)']).applymap(highlight_cost, subset=['Cost/km (₹)']).format({
        'kWh Used': '{:.2f}',
        'Cost/km (₹)': '{:.2f}'
    })
    st.dataframe(styled_df, use_container_width=True, hide_index=True)
    
    # --- Charts ---
    st.subheader("📈 Trends")
    
    # Prepare chart data with simple column names
    chart_data = pd.DataFrame({
        'Date': df['End Date'].values,
        'Range': df['Est. Range (km)'].values,
        'Cost': df['Cost/km (₹)'].values
    })
    if insights_order == "Newest first":
        chart_data = chart_data.iloc[::-1].reset_index(drop=True)
    
    # Group by date and take average
    chart_grouped = chart_data.groupby('Date', sort=False).agg({'Range': 'mean', 'Cost': 'mean'}).reset_index()
    
    col_chart1, col_chart2 = st.columns(2)
    with col_chart1:
        st.caption("Avg. Est. Range (km) by Date")
        st.bar_chart(chart_grouped, x='Date', y='Range', color='#4CAF50')
    with col_chart2:
        st.caption("Avg. Cost/km (₹) by Date")
        st.bar_chart(chart_grouped, x='Date', y='Cost', color='#FF5722')
else:
    st.info("Need at least 2 charging cycles to show insights.")

# --- Charging History ---
st.header("📋 Charging History")
if data:
    col_sort2, col_del = st.columns([1, 3])
    with col_sort2:
        history_order = st.selectbox("Sort by", ["Oldest first", "Newest first"], key="history_sort")
    with col_del:
        if st.button("🗑️ Delete All Data", type="secondary"):
            save_data([])
            st.success("All data deleted!")
            st.rerun()
    
    # Sort data based on selection
    sorted_data = data if history_order == "Oldest first" else data[::-1]
    
    # Display as a proper table
    history_df = pd.DataFrame([{
        'Date': c['date'],
        'Start %': c['start_percent'],
        'End %': c['end_percent'],
        'Type': c['charge_type'],
        'Hours': c['time_to_charge'],
        'kWh': c['kwh_used'],
        '₹/kWh': c['cost_per_kwh'],
        'Odometer': int(c['odometer']),
        'Speed (kW)': round(c['kwh_used'] / c['time_to_charge'], 2) if c['time_to_charge'] > 0 else 0
    } for c in sorted_data])
    
    def highlight_speed(val):
        if val > 4:
            return 'color: red'
        return 'color: green'
    
    styled_history = history_df.style.applymap(highlight_speed, subset=['Speed (kW)']).format({
        'Hours': '{:.2f}',
        'kWh': '{:.2f}',
        '₹/kWh': '{:.2f}',
        'Speed (kW)': '{:.2f}'
    })
    st.dataframe(styled_history, use_container_width=True, hide_index=True)
    
    # Individual delete with expander
    with st.expander("Delete Individual Entries"):
        for idx, charge in enumerate(data):
            col1, col2 = st.columns([4, 1])
            with col1:
                st.text(f"{charge['date']} | {charge['odometer']} km | {charge['start_percent']}% → {charge['end_percent']}%")
            with col2:
                if st.button("Delete", key=f"del_{idx}"):
                    data.pop(idx)
                    save_data(data)
                    st.rerun()
else:
    st.info("No charging data yet. Add your first charge above!")