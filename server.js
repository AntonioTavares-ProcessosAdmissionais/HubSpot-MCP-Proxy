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
    { name: 'search_contacts', description: 'Search contacts with optional filters (email, firstname, lastname)' },
    { name: 'get_contact', description: 'Get contact by ID with all properties and associations' },
    { name: 'search_companies', description: 'Search companies with optional filters (name, domain)' },
    { name: 'get_company', description: 'Get company by ID with all properties and associations' },
    { name: 'search_deals', description: 'Search deals with optional filters (dealname, dealstage)' },
    { name: 'get_deal', description: 'Get deal by ID with all properties and associations' },
    { name: 'get_contact_activities', description: 'Get all activities (calls, meetings, notes, emails) for a contact' },
    { name: 'get_company_contacts', description: 'Get all contacts associated with a company' },
    { name: 'get_contact_deals', description: 'Get all deals associated with a contact' },
    { name: 'search_by_email', description: 'Find contact by email address' },
    { name: 'search_by_domain', description: 'Find company by domain name' },
    { name: 'get_deal_pipeline', description: 'Get all deals in a specific pipeline stage' },
    { name: 'get_recent_activities', description: 'Get recent activities across all contacts' }
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
      // Basic searches
      case 'search_contacts':
        let contactQuery = `/crm/v3/objects/contacts?limit=${limit}`;
        if (args.email) {
          const searchResult = await callHubSpotAPI('/crm/v3/objects/contacts/search', 'POST', {
            filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: args.email }] }],
            limit
          });
          result = searchResult;
        } else if (args.firstname || args.lastname) {
          const filters = [];
          if (args.firstname) filters.push({ propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: args.firstname });
          if (args.lastname) filters.push({ propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: args.lastname });
          const searchResult = await callHubSpotAPI('/crm/v3/objects/contacts/search', 'POST', {
            filterGroups: [{ filters }],
            limit
          });
          result = searchResult;
        } else {
          result = await callHubSpotAPI(contactQuery);
        }
        break;

      case 'get_contact':
        result = await callHubSpotAPI(`/crm/v3/objects/contacts/${args.contactId}?associations=companies,deals`);
        break;

      case 'search_companies':
        if (args.name || args.domain) {
          const filters = [];
          if (args.name) filters.push({ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: args.name });
          if (args.domain) filters.push({ propertyName: 'domain', operator: 'EQ', value: args.domain });
          const searchResult = await callHubSpotAPI('/crm/v3/objects/companies/search', 'POST', {
            filterGroups: [{ filters }],
            limit
          });
          result = searchResult;
        } else {
          result = await callHubSpotAPI(`/crm/v3/objects/companies?limit=${limit}`);
        }
        break;

      case 'get_company':
        result = await callHubSpotAPI(`/crm/v3/objects/companies/${args.companyId}?associations=contacts,deals`);
        break;

      case 'search_deals':
        if (args.dealname || args.dealstage) {
          const filters = [];
          if (args.dealname) filters.push({ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: args.dealname });
          if (args.dealstage) filters.push({ propertyName: 'dealstage', operator: 'EQ', value: args.dealstage });
          const searchResult = await callHubSpotAPI('/crm/v3/objects/deals/search', 'POST', {
            filterGroups: [{ filters }],
            limit
          });
          result = searchResult;
        } else {
          result = await callHubSpotAPI(`/crm/v3/objects/deals?limit=${limit}`);
        }
        break;

      case 'get_deal':
        result = await callHubSpotAPI(`/crm/v3/objects/deals/${args.dealId}?associations=contacts,companies`);
        break;

      // Advanced features
      case 'get_contact_activities':
        const contactId = args.contactId;
        const [calls, meetings, notes, emails] = await Promise.all([
          callHubSpotAPI(`/crm/v3/objects/calls/search`, 'POST', {
            filterGroups: [{ filters: [{ propertyName: 'associations.contact', operator: 'EQ', value: contactId }] }],
            limit: 20
          }).catch(() => ({ results: [] })),
          callHubSpotAPI(`/crm/v3/objects/meetings/search`, 'POST', {
            filterGroups: [{ filters: [{ propertyName: 'associations.contact', operator: 'EQ', value: contactId }] }],
            limit: 20
          }).catch(() => ({ results: [] })),
          callHubSpotAPI(`/crm/v3/objects/notes/search`, 'POST', {
            filterGroups: [{ filters: [{ propertyName: 'associations.contact', operator: 'EQ', value: contactId }] }],
            limit: 20
          }).catch(() => ({ results: [] })),
          callHubSpotAPI(`/crm/v3/objects/emails/search`, 'POST', {
            filterGroups: [{ filters: [{ propertyName: 'associations.contact', operator: 'EQ', value: contactId }] }],
            limit: 20
          }).catch(() => ({ results: [] }))
        ]);
        result = {
          calls: calls.results || [],
          meetings: meetings.results || [],
          notes: notes.results || [],
          emails: emails.results || [],
          total: (calls.results?.length || 0) + (meetings.results?.length || 0) + 
                 (notes.results?.length || 0) + (emails.results?.length || 0)
        };
        break;

      case 'get_company_contacts':
        const companyId = args.companyId;
        const companyData = await callHubSpotAPI(`/crm/v3/objects/companies/${companyId}?associations=contacts`);
        const contactIds = companyData.associations?.contacts?.results?.map(c => c.id) || [];
        if (contactIds.length > 0) {
          const contacts = await callHubSpotAPI(`/crm/v3/objects/contacts/batch/read`, 'POST', {
            inputs: contactIds.map(id => ({ id })),
            properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle']
          });
          result = contacts;
        } else {
          result = { results: [] };
        }
        break;

      case 'get_contact_deals':
        const conId = args.contactId;
        const contactData = await callHubSpotAPI(`/crm/v3/objects/contacts/${conId}?associations=deals`);
        const dealIds = contactData.associations?.deals?.results?.map(d => d.id) || [];
        if (dealIds.length > 0) {
          const deals = await callHubSpotAPI(`/crm/v3/objects/deals/batch/read`, 'POST', {
            inputs: dealIds.map(id => ({ id })),
            properties: ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline']
          });
          result = deals;
        } else {
          result = { results: [] };
        }
        break;

      case 'search_by_email':
        const emailSearch = await callHubSpotAPI('/crm/v3/objects/contacts/search', 'POST', {
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: args.email }] }],
          properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle'],
          limit: 1
        });
        result = emailSearch;
        break;

      case 'search_by_domain':
        const domainSearch = await callHubSpotAPI('/crm/v3/objects/companies/search', 'POST', {
          filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: args.domain }] }],
          properties: ['name', 'domain', 'industry', 'city', 'state', 'country', 'numberofemployees'],
          limit: 1
        });
        result = domainSearch;
        break;

      case 'get_deal_pipeline':
        const pipelineStage = args.dealstage;
        const pipelineDeals = await callHubSpotAPI('/crm/v3/objects/deals/search', 'POST', {
          filterGroups: [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: pipelineStage }] }],
          properties: ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline'],
          limit: args.limit || 50
        });
        result = pipelineDeals;
        break;

      case 'get_recent_activities':
        const recentActivities = await callHubSpotAPI('/crm/v3/objects/calls', 'GET');
        result = recentActivities;
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
  console.log(`��� HubSpot MCP Proxy on http://localhost:${PORT}`);
  console.log(`✅ Token: ${HUBSPOT_TOKEN ? 'Configured' : 'NOT SET'}`);
});
