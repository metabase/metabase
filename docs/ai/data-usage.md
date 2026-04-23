---
title: Data sent to AI providers
summary: What data Metabase sends to AI providers when you use AI features, and how to control it.
---

# Data sent to AI providers

When you use AI features in Metabase (like [Metabot](./metabot.md) or inline SQL generation), Metabase sends some of your data to an AI provider to generate responses. This page explains what data is sent, when, and what controls you have.

**Metabase never sends your data to an AI provider unless someone explicitly uses an AI feature.** There is no background or automatic transmission of your data to AI providers.

## AI providers

When you use AI features, your data is sent to whichever provider you've configured in [Admin > AI](./settings.md):

- **Metabase Cloud with Metabot add-on**: requests are routed through Metabase's proxy to Anthropic (Claude). Metabase does not store your prompts or responses.
- **Bring your own API key** (Cloud or self-hosted): requests go directly from your Metabase instance to the provider you selected (currently Anthropic). Your data is subject to your provider's data handling policies.

In all cases, review your AI provider's privacy policy and terms of service, particularly around data retention and training.

## What data is sent, by feature

### Metabot chat

When someone sends a message to Metabot, each request can include:

- **The user's message** and prior messages in the conversation.
- **Database schema**: table names, column names, column types, foreign key relationships, and field descriptions for tables the user has permission to access.
- **Field metadata**: semantic types (e.g., "this column is an email address") and sample values for low-cardinality fields (e.g., a "Status" column with values like "Active" and "Inactive").
- **Query results**: when Metabot runs a query to answer a question, the results are included in follow-up messages so Metabot can interpret them.
- **Dashboard and visualization context**: if the user is viewing a dashboard or chart, Metabot may include the chart configuration and data to provide relevant answers.

### Inline SQL generation

When someone uses the "Generate SQL" or "Fix this SQL" feature in the query editor, each request includes:

- **The user's prompt** (e.g., "Show me top customers by revenue").
- **Database schema** for tables the user can access (same as Metabot above).
- **The current SQL query**, if the user is editing or fixing an existing query.
- **The database engine type** (e.g., Postgres, MySQL) so the AI generates valid syntax.

### Document content generation

When someone uses AI to generate content in a [document](../dashboards/documents.md), each request includes:

- **The user's instructions** for what to generate.
- **Database schema and available metrics/models** the user can access.

### Suggested prompts

When Metabot generates suggested prompts (the example questions shown in the chat interface), this happens automatically when Metabot is enabled. Each request includes:

- **Table and model names**, descriptions, and basic schema information.

This is the only AI feature that runs without a direct user action, though it still requires an admin to have enabled Metabot.

## What is NOT sent to AI providers

- **Credentials**: database connection strings, passwords, API keys, or authentication tokens are never sent.
- **User account information**: emails, passwords, or session tokens are not included in AI requests.
- **Data from tables the user can't access**: Metabase respects [data permissions](../permissions/data.md) — if a user can't see a table, its schema and data won't be included in their AI requests.
- **Your full database contents**: only schema metadata and query results relevant to the current interaction are sent, not bulk data exports.

## Metabase product analytics (separate from AI providers)

Metabase collects anonymous product analytics (via Snowplow) about AI feature usage, such as:

- Which AI model was used.
- Token counts (how long the prompt and response were).
- Whether the interaction succeeded or failed.
- User feedback ratings (e.g., "great", "wrong data").

This data is sent to Metabase (not to the AI provider) and does **not** include the content of your prompts, queries, or data. See [Information collection](../installation-and-operation/information-collection.md) for details on anonymous usage data.

## Controls available to admins

| Control | What it does |
|---|---|
| **Disable AI features entirely** | Admin > AI: disconnect your provider or remove the Metabot add-on. No data will be sent to any AI provider. |
| **Limit which data Metabot can see** | Use [data permissions](../permissions/data.md) and [collection permissions](../permissions/collections.md). Metabot only accesses data the current user is allowed to see. |
| **Choose your provider** | Bring your own API key to control which provider processes your data and under what terms. |
| **Disable Metabot chat** | Admin > AI > Metabot: toggle Metabot off while keeping other AI features (like inline SQL generation) available. |
| **Customize system prompts** | Admin > AI: modify the system prompts sent with each request. This doesn't change what data is sent, but lets you add instructions (e.g., "never include PII in generated queries"). |

## Frequently asked questions

### Does Metabase store my AI conversations?

Metabase stores conversation history in your application database so users can return to previous chats. This data stays in your Metabase instance (or on Metabase Cloud infrastructure, for Cloud customers). It is not shared with anyone.

### Can the AI provider use my data for training?

This depends on your provider's policies. When using the Metabot add-on on Metabase Cloud, Metabase's agreements with Anthropic prohibit using your data for model training. When using your own API key, refer to your provider's terms.

### Is data sent in real-time or batched?

All AI requests happen in real-time, one at a time, in response to a user action. There is no batching or background sync of data to AI providers (except for [suggested prompt generation](#suggested-prompts), which runs periodically but only sends schema metadata).

### What happens if I disable AI features?

No further data is sent to any AI provider. Existing conversation history remains in your application database until you delete it.
