const express = require('express');
const path = require('path');
const { CosmosClient } = require('@azure/cosmos');
const { DefaultAzureCredential } = require('@azure/identity');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cosmos DB setup
const endpoint = process.env.COSMOS_ENDPOINT || 'https://evtrackerdb.documents.azure.com:443/';
const databaseId = 'EVData';
const containerId = 'Charges';

let container;

async function initCosmosDB() {
    try {
        const credential = new DefaultAzureCredential();
        const client = new CosmosClient({ endpoint, aadCredentials: credential });
        const database = client.database(databaseId);
        container = database.container(containerId);
        console.log('Connected to Cosmos DB');
    } catch (error) {
        console.error('Failed to connect to Cosmos DB:', error.message);
    }
}

// API: Get all charges
app.get('/api/charges', async (req, res) => {
    try {
        if (!container) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { resources } = await container.items.query('SELECT * FROM c ORDER BY c.date DESC').fetchAll();
        res.json(resources);
    } catch (error) {
        console.error('Error fetching charges:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Save a charge
app.post('/api/charges', async (req, res) => {
    try {
        if (!container) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const charge = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        const { resource } = await container.items.create(charge);
        res.status(201).json(resource);
    } catch (error) {
        console.error('Error saving charge:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Delete a charge
app.delete('/api/charges/:id', async (req, res) => {
    try {
        if (!container) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { id } = req.params;
        await container.item(id, id).delete();
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting charge:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Delete all charges
app.delete('/api/charges', async (req, res) => {
    try {
        if (!container) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { resources } = await container.items.query('SELECT c.id FROM c').fetchAll();
        for (const item of resources) {
            await container.item(item.id, item.id).delete();
        }
        res.json({ success: true, deleted: resources.length });
    } catch (error) {
        console.error('Error deleting all charges:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
initCosmosDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
