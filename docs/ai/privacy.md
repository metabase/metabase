---
title: AI privacy
summary: What data Metabase sends to AI providers and MCP clients when you use AI features, and what Metabase the company collects.
---

# AI privacy

AI in Metabase is optional.

If you do use AI (which you can set up in [AI settings](./settings.md)), we need to send some data outside of your Metabase. This page covers what gets sent, and to whom.

## Data sent to the Metabase AI Service

When using the Metabase AI service, the data we send includes:

- Your prompts and the earlier messages in the conversation.
- Metadata (like table and field names), so Metabot knows what to query.
- A sampling of field values from your database. For example, if you ask Metabot to "Filter everyone from Wisconsin," it might check the values in the state field to see how the data is stored (like "WI" vs "Wisconsin"). See [syncs](../databases/sync-scan.md).
- For chart analysis, metrics derived from the chart's data (like slopes and series correlations), and some categorical values. For example, if a question breaks out orders over time by a product category, the AI could see the category values ("Gadgets", "Widgets", etc).
- Query results, if query execution is turned on for Metabot.

How Metabase the company processes this data is covered by your agreement with Metabase. Only Metabase Cloud customers have access to the Metabase AI Service.

## When query execution is on, Metabot sends query results to the AI provider

When query execution is on, Metabot can run queries and read their results, so it can answer with actual values from your data. Metabase sends those results to the AI provider.

Metabot can run queries on your behalf, including ones it wrote itself, the one you're looking at, and saved questions you can access.

These can be query builder or SQL queries, but admins can disable SQL for Metabot.

Query execution is on by default. Admins can turn it off in [AI settings](./settings.md#allow-metabot-to-read-query-results).

For each query Metabot runs, Metabase sends part of the result to the AI provider, like the column names and a limited number of rows. Metabot can run many queries in one conversation.

If a query fails, Metabase also sends your database's error message. Error messages can include values from your data.

### Metabot reads results in line with your data permissions

Metabot runs queries as you, with your data permissions, including [row and column security](../permissions/row-and-column-security.md). Metabot can only read query results that you have permission to see.

### Query results are stored with the conversation

Metabase stores the query results that Metabot reads as part of the conversation, in your Metabase application database.

On Pro and Enterprise plans, admins can review stored conversations, including query results, in [AI usage auditing](./usage-auditing.md).

By default, your Metabase instance keeps stored conversations for a limited time. On self-hosted Metabase, you can change how long with [`MB_AI_USAGE_MAX_RETENTION_DAYS`](../configuring-metabase/environment-variables.md#mb_ai_usage_max_retention_days).

## Data sent to your own AI provider

If you're using your own API key, everything listed above is sent to your selected AI provider, including query results when Metabot can run queries. Your provider's data handling, retention, and privacy policies apply to that data. Query execution is on by default, so review them before people start using Metabot, or turn query execution off until you have.

## Data sent to the MCP client

When using the [MCP server](./mcp.md), query _results_ are sent to the connected MCP client.

## Data sent when submitting feedback

If you [submit feedback](./metabot.md#giving-feedback-on-metabot-responses) on a Metabot response, the context for that conversation, including metadata, your prompts, and any query results that Metabot read, might be sent to Metabase the company, and may contain sensitive data.

## Further reading

- [AI settings](./settings.md)
- [Using Metabot](./metabot.md)
- [AI usage auditing](./usage-auditing.md)
- [MCP server](./mcp.md)
- [Row and column security](../permissions/row-and-column-security.md)
- [Privacy and GDPR](../installation-and-operation/privacy.md)
