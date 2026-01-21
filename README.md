# My EV - Connected Car Charging Tracker

A mobile-first web application for EV owners to track charging sessions, analyze driving efficiency, and monitor cost-per-kilometer trends. Built with a modern JavaScript frontend and Node.js backend, deployed on Azure with secure Managed Identity authentication.

![My EV App](https://img.shields.io/badge/Platform-Azure-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![Cosmos DB](https://img.shields.io/badge/Database-Cosmos%20DB-purple)

## 🚗 Features

### Core Charging Tracker
- **Add Charging Sessions**: Record date, odometer, battery percentages, kWh used, cost per kWh, and charge type (Fast/Slow)
- **Journey Insights**: Automatically calculates metrics between charges:
  - Estimated full-charge range
  - Cost per kilometer
  - Battery percentage used
  - Distance traveled
- **Charging History**: View all charging sessions with:
  - Charging speed (kW)
  - Total cost
  - Duration
  - Battery gain percentage
- **Performance Charts**: Visual trends for:
  - Estimated range over time
  - Cost per km over time
- **Data Import/Export**: 
  - Import from Excel (.xlsx)
  - Export to JSON

### Additional Connected Car Features (Demo)
- Dashboard with car status, battery level, location
- Quick controls (Lock/Unlock, Climate, Horn, Lights)
- Trip history with eco scores
- Service & maintenance tracking
- Nearby charger finder

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
│                    (Mobile-First PWA Design)                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Azure App Service (Linux)                    │
│                         Free F1 Tier                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Node.js Express Server                 │  │
│  │  • Serves static files (HTML, CSS, JS)                    │  │
│  │  • REST API endpoints (/api/charges)                      │  │
│  │  • Managed Identity authentication                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ Managed Identity
                                │ (No keys/secrets)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Azure Cosmos DB (Serverless)                   │
│                      NoSQL Document Store                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Database: EVData                                         │  │
│  │  Container: Charges                                       │  │
│  │  Partition Key: /id                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Azure Services Used

| Service | SKU/Tier | Purpose | Estimated Cost |
|---------|----------|---------|----------------|
| **App Service** | Free F1 (Linux) | Host Node.js backend + static files | Free |
| **Cosmos DB** | Serverless | Store charging data (NoSQL) | ~₹0-50/month* |
| **Managed Identity** | System-assigned | Secure, keyless authentication | Free |

*Cosmos DB serverless charges based on Request Units consumed. Light usage stays very low cost.

### Why This Architecture?

1. **Managed Identity over Access Keys**: Azure policy may block key-based authentication. Managed Identity provides secure, automatic credential rotation without storing secrets.

2. **App Service over Static Web Apps**: SWA's managed functions don't support Managed Identity for data connections. App Service with system-assigned identity works seamlessly.

3. **Cosmos DB Serverless**: Pay only for what you use. Perfect for personal apps with sporadic usage patterns.

4. **Single Region (Central India)**: Minimizes latency for Indian users and keeps costs low.

## 📁 Project Structure

```
ev-app/
├── public/                 # Frontend (served as static files)
│   ├── index.html         # Main app HTML
│   ├── styles.css         # Mobile-first CSS
│   ├── script.js          # App logic, charts, API calls
│   └── manifest.json      # PWA manifest
├── server.js              # Express server with Cosmos DB
├── package.json           # Node.js dependencies
└── README.md              # This file
```

## 🚀 Deployment Guide

### Prerequisites
- Azure CLI installed and logged in (`az login`)
- Node.js 18+ installed locally
- Git installed
- GitHub account (for deployment source)

### Step 1: Create Resource Group

```bash
az group create --name ev-tracker-rg --location centralindia
```

### Step 2: Create Cosmos DB Account (Serverless)

```bash
# Create Cosmos DB account
az cosmosdb create \
  --name evtrackerdb \
  --resource-group ev-tracker-rg \
  --locations regionName=centralindia \
  --capabilities EnableServerless

# Create database
az cosmosdb sql database create \
  --account-name evtrackerdb \
  --resource-group ev-tracker-rg \
  --name EVData

# Create container
az cosmosdb sql container create \
  --account-name evtrackerdb \
  --resource-group ev-tracker-rg \
  --database-name EVData \
  --name Charges \
  --partition-key-path /id
```

### Step 3: Create App Service

```bash
# Create App Service Plan (Free tier)
az appservice plan create \
  --name ev-tracker-plan \
  --resource-group ev-tracker-rg \
  --sku F1 \
  --is-linux

# Create Web App
az webapp create \
  --name ev-tracker-app \
  --resource-group ev-tracker-rg \
  --plan ev-tracker-plan \
  --runtime "NODE:18-lts"
```

### Step 4: Enable Managed Identity

```bash
# Enable system-assigned managed identity
az webapp identity assign \
  --name ev-tracker-app \
  --resource-group ev-tracker-rg
```

Save the `principalId` from the output - you'll need it next.

### Step 5: Grant Cosmos DB Access to Managed Identity

```bash
# Get your subscription ID
az account show --query id -o tsv

# Get Cosmos DB scope
COSMOS_SCOPE="/subscriptions/<subscription-id>/resourceGroups/ev-tracker-rg/providers/Microsoft.DocumentDB/databaseAccounts/evtrackerdb"

# Assign Cosmos DB Data Contributor role
az role assignment create \
  --assignee <principalId-from-step-4> \
  --role "Cosmos DB Built-in Data Contributor" \
  --scope $COSMOS_SCOPE
```

### Step 6: Configure App Settings

```bash
# Get Cosmos DB endpoint
az cosmosdb show --name evtrackerdb --resource-group ev-tracker-rg --query documentEndpoint -o tsv

# Set environment variables
az webapp config appsettings set \
  --name ev-tracker-app \
  --resource-group ev-tracker-rg \
  --settings \
    COSMOS_ENDPOINT="https://evtrackerdb.documents.azure.com:443/" \
    COSMOS_DATABASE="EVData" \
    COSMOS_CONTAINER="Charges"
```

### Step 7: Deploy Code

**Option A: GitHub Deployment (Recommended)**

```bash
# Push your code to GitHub first, then:
az webapp deployment source config \
  --name ev-tracker-app \
  --resource-group ev-tracker-rg \
  --repo-url https://github.com/<your-username>/ev-charging-tracker \
  --branch main \
  --manual-integration

# Sync deployment
az webapp deployment source sync \
  --name ev-tracker-app \
  --resource-group ev-tracker-rg
```

**Option B: Local Git Deployment**

```bash
# Configure local git
az webapp deployment source config-local-git \
  --name ev-tracker-app \
  --resource-group ev-tracker-rg

# Add Azure as remote and push
git remote add azure <deployment-url-from-above>
git push azure main
```

### Step 8: Verify Deployment

```bash
# Open in browser
az webapp browse --name ev-tracker-app --resource-group ev-tracker-rg
```

Your app should be live at: `https://ev-tracker-app.azurewebsites.net`

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Set environment variables (create .env file)
COSMOS_ENDPOINT=https://evtrackerdb.documents.azure.com:443/
COSMOS_DATABASE=EVData
COSMOS_CONTAINER=Charges

# Run locally (requires Azure CLI login for Managed Identity)
az login
npm start

# Open http://localhost:3000
```

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/charges` | Get all charging records |
| POST | `/api/charges` | Add new charging record |
| DELETE | `/api/charges/:id` | Delete a charging record |
| DELETE | `/api/charges` | Delete all records |

### Charging Record Schema

```json
{
  "id": "uuid",
  "date": "2026-01-21",
  "odometer": 12500,
  "startPercent": 20,
  "endPercent": 80,
  "timeToCharge": 2.5,
  "kwhUsed": 18.5,
  "costPerKwh": 8.50,
  "chargeType": "Slow"
}
```

## 📱 Excel Import Format

For bulk importing charging data, use an Excel file with these columns:

| Date | Odometer | Start_Percent | End_Percent | Time_to_Charge | kWh_Used | Cost_per_kWh | Charge_Type |
|------|----------|---------------|-------------|----------------|----------|--------------|-------------|
| 2026-01-15 | 12000 | 15 | 85 | 3.5 | 21.2 | 8.50 | Slow |
| 2026-01-18 | 12150 | 25 | 90 | 1.2 | 19.8 | 18.00 | Fast |

## 🧹 Cleanup Resources

To delete all Azure resources:

```bash
az group delete --name ev-tracker-rg --yes --no-wait
```

## 🔒 Security Notes

- **No secrets in code**: Uses Azure Managed Identity for Cosmos DB authentication
- **HTTPS only**: App Service enforces HTTPS
- **No API keys exposed**: Frontend communicates through backend proxy
- **CORS handled server-side**: Express serves both API and frontend

## 📄 License

MIT License - Feel free to use and modify for your own EV tracking needs!

---

Built with ❤️ for EV owners who want to understand their driving efficiency and charging costs.
