const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = 'EVData';
const containerId = 'Charges';

let client = null;
let container = null;

async function getContainer() {
    if (container) return container;
    
    client = new CosmosClient({ endpoint, key });
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

        // DELETE request - delete one or all items
        if (req.method === 'DELETE') {
            const id = req.query.id;
            const deleteAll = req.query.deleteAll === 'true';
            
            if (deleteAll) {
                // Delete all items
                const { resources } = await cont.items.readAll().fetchAll();
                for (const item of resources) {
                    await cont.item(item.id, item.id).delete();
                }
                context.res = { status: 200, body: { message: 'All data deleted' } };
                return;
            } else if (id) {
                // Delete single item
                await cont.item(id, id).delete();
                context.res = { status: 200, body: { message: 'Item deleted' } };
                return;
            } else {
                context.res = { status: 400, body: { error: 'No id provided for deletion' } };
                return;
            }
        }

        // POST request - create new charge
        if (req.method === 'POST') {
            const charge = req.body;
            
            // Validate required fields
            if (!charge.date || charge.startPercent === undefined || charge.endPercent === undefined) {
                context.res = { status: 400, body: { error: 'Missing required fields' } };
                return;
            }
            
            charge.id = new Date().getTime().toString();
            charge.createdAt = new Date().toISOString();
            
            await cont.items.create(charge);
            context.res = { 
                status: 200, 
                headers: { 'Content-Type': 'application/json' },
                body: { message: 'Charge saved', id: charge.id } 
            };
            return;
        }

        context.res = { status: 405, body: { error: 'Method not allowed' } };
    } catch (error) {
        context.log.error('Error:', error.message);
        context.res = { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Server error: ' + error.message } 
        };
    }
};