const { CosmosClient } = require('@azure/cosmos');
const { ManagedIdentityCredential } = require('@azure/identity');

const endpoint = process.env.COSMOS_ENDPOINT;
const databaseId = 'EVData';
const containerId = 'Charges';

let client = null;
let container = null;

async function getContainer() {
    if (container) return container;
    
    // Use Managed Identity for authentication
    const credential = new ManagedIdentityCredential();
    client = new CosmosClient({ endpoint, aadCredentials: credential });
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    const { container: cont } = await database.containers.createIfNotExists({ 
        id: containerId,
        partitionKey: { paths: ['/id'] }
    });
    container = cont;
    return container;
}

module.exports = async function (context, req) {
    try {
        const cont = await getContainer();

        // Query all charges sorted by date
        const querySpec = {
            query: 'SELECT * FROM c ORDER BY c.date ASC'
        };
        const { resources: charges } = await cont.items.query(querySpec).fetchAll();

        // Return raw charge data - insights are calculated on the client
        context.res = { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' },
            body: charges 
        };
    } catch (error) {
        context.log.error('Error:', error.message);
        context.res = { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Error fetching data: ' + error.message }
        };
    }
};