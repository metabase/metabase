---
title: AI privacy
summary: What data Metabase sends to AI providers and MCP clients when you use AI features, and what Metabase the company collects.
---

# AI privacy

AI in Metabase is optional.

If you do use AI (which you can set up in [AI settings](./settings.md)), we need to send some data outside of your Metabase. This page covers what gets sent, and to whom.

## Data sent to the Metabase AI service

When using the Metabase AI service, we don't send the _results_ of your queries to a third-party AI provider, and we don't look at them ourselves.

What we send:

- Your prompts.
- Metadata (like table and field names), so Metabot knows what to query.
- A sampling of field values from your database. For example, if you ask Metabot to "Filter everyone from Wisconsin," it might check the values in the state field to see how the data is stored (like "WI" vs "Wisconsin"). See [syncs](../databases/sync-scan.md).
- For chart analysis, AI won't see the raw timeseries data, but it does see some metrics derived from that data (like slopes, series correlations, etc). AI may also see some categorical values. For example, if a question breaks out orders over time by a product category, the AI could see the category values ("Gadgets", "Widgets", etc).

We, Metabase the company, also collect some of this metadata to gauge usage and improve the AI integration.

## Data sent to your own AI provider

If you're using your own API key, everything listed above is sent to your selected AI provider. Review your provider's data handling and privacy policies.

## Data sent to the MCP client

When using the [MCP server](./mcp.md), query _results_ are sent to the connected MCP client.

## Data sent when submitting feedback

If you [submit feedback](./metabot.md#giving-feedback-on-metabot-responses) on a Metabot response, the context for that conversation, including metadata and your prompts, might be sent to Metabase the company, and may contain sensitive data.

## Further reading

- [AI settings](./settings.md)
- [Using Metabot](./metabot.md)
- [MCP server](./mcp.md)
- [Privacy and GDPR](../installation-and-operation/privacy.md)
