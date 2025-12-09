require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.env.HUBSPOT_API_KEY;
const HUBSPOT_API = 'https://api.hubapi.com';

async function callHubSpotAPI(endpoint, method = 'GET', data = null) {
  try {
    const response = await axios({
      method,
      url: `${HUBSPOT_API}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data
    });
    return response.data;
  } catch (error) {
    throw new Error(`HubSpot API Error: ${error.response?.data?.message || error.message}`);
  }
}

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    hasToken: !!HUBSPOT_TOKEN,
    message: 'HubSpot MCP Proxy is running'
  });
});

app.get('/list-tools', (req, res) => {
  const tools = [
    { name: 'search_contacts', description: 'Search contacts in HubSpot' },
    { name: 'get_contact', description: 'Get contact by ID' },
    { name: 'search_companies', description: 'Search companies' },
    { name: 'get_company', description: 'Get company by ID' },
    { name: 'search_deals', description: 'Search deals' },
    { name: 'get_deal', description: 'Get deal by ID' }
  ];
  res.json({ success: true, tools });
});

app.post('/run-mcp-tool', async (req, res) => {
  const { tool_name, arguments: args = {} } = req.body;

  if (!HUBSPOT_TOKEN) {
    return res.status(500).json({ error: 'Token not set' });
  }

  try {
    let result;
    const limit = args.limit || 10;

    switch (tool_name) {
      case 'search_contacts':
        result = await callHubSpotAPI(`/crm/v3/objects/contacts?limit=${limit}`);
        break;
      case 'get_contact':
        result = await callHubSpotAPI(`/crm/v3/objects/contacts/${args.contactId}`);
        break;
      case 'search_companies':
        result = await callHubSpotAPI(`/crm/v3/objects/companies?limit=${limit}`);
        break;
      case 'get_company':
        result = await callHubSpotAPI(`/crm/v3/objects/companies/${args.companyId}`);
        break;
      case 'search_deals':
        result = await callHubSpotAPI(`/crm/v3/objects/deals?limit=${limit}`);
        break;
      case 'get_deal':
        result = await callHubSpotAPI(`/crm/v3/objects/deals/${args.dealId}`);
        break;
      default:
        return res.status(400).json({ error: `Unknown tool: ${tool_name}` });
    }

    res.json({ success: true, tool_name, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`íº€ HubSpot MCP Proxy on http://localhost:${PORT}`);
  console.log(`âœ… Token: ${HUBSPOT_TOKEN ? 'Configured' : 'NOT SET'}`);
});
