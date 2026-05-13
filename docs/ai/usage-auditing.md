---
title: AI usage auditing
summary: "See token and message counts, chat logs, and more."
---

# AI usage auditing

{% include plans-blockquote.html feature="AI usage auditing" %}

_Admin > AI > Usage auditing_

Admins can get an overview of human-robot interactions across Metabase, from high-level stats like total token counts down to visibility into actual conversations. These interactions include the in-product Metabot chat sidebar, Metabot conversations in [Documents](../documents/start.md), [Slack chats](./metabot-slack.md), and [inline SQL editing](./metabot.md#inline-sql-editing).

The usage auditing section includes:

- [Stats](#stats): aggregate charts across all Metabot activity.
- [Conversations](#conversations): a filterable list of every conversation, with a detail view for each.

You can also build your own questions on top of the [Usage Analytics views](#building-custom-reports) that back these reports.

## Stats

_Admin > AI > Usage auditing > Stats_

The Stats page shows aggregate Metabot activity over a date range you choose, defaulting to the previous 30 days.

### Filters

- **Date range**: the time window the charts cover.
- **User**: limit to a single person (or **All users**).
- **Group**: limit to a single [group](../people-and-groups/managing.md) (or **All groups**).
- **Tenant**: limit to a single [tenant](../embedding/tenants.md). Only shows up if tenants are enabled.

### Metrics

Pick what you want to count:

- **Conversations**: one row per distinct Metabot chat, across every surface listed above (chat sidebar, Documents, Slack, inline SQL). Not MCP conversations.
- **Tokens**: total tokens (input and output) consumed by LLM calls.
- **Messages**: every message exchanged, both from people and from Metabot.

For each metric, you'll see the same set of charts:

- **By time**: a time-series chart that buckets by hour or day depending on the date range you filter. Defaults to day.
- **By source**: _where_ in Metabase the request came from. See [Sources and profiles](#sources-and-profiles).
- **By profile**: _which_ Metabot persona answered. See [Sources and profiles](#sources-and-profiles).
- **Users with most ...**, **Groups with most ...**, **IP addresses with most ...**: top-N rankings.
- **Tenants with most ...**: only shown when tenants are enabled.

You can drill through in the **By day**, **Groups with most ...**, **Users with most ...**, or **Tenants with most ...** charts to see the [Conversations list](#conversations) with the corresponding filter applied. The **By source**, **By profile**, and **IP addresses with most ...** charts are display-only.

## Sources and profiles

- **Source** is _where_ the request came from in Metabase.
- **Profile** is _which agent persona_ answered it.

They often line up (a conversation that started in Slack is handled by the Slackbot profile), but they don't have to. A conversation started from the Metabot chat sidebar might be handled by the **Internal**, **NLQ**, or **SQL** profile depending on what the person asked.

The Conversations admin page only shows **Profile**. Source is visible in the **Stats** charts and in the [Usage Analytics models](#building-custom-reports) used to build custom reports.

### Sources

Each conversation is tagged with a source, i.e. where in Metabase the conversation took place. The **By source** chart in [Stats](#stats) groups conversations by a human-readable `source_name`, and the [AI Usage Log](#building-custom-reports) model exposes both `source_name` and a raw `source` ID (e.g. `metabot_agent`, `oss-sql-gen`, `document_generate_content`) for custom reports. Conversations Metabase couldn't classify show up as `(empty)` on the chart.

| Source name         | Where it comes from                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Metabot`           | The Metabot chat sidebar inside Metabase.                                                                               |
| `Documents`         | Content generation inside [Documents](../documents/start.md).                                                           |
| `Suggested Prompts` | Background generation of suggested prompts.                                                                             |
| `Slackbot`          | Conversations that started in [Slack](./metabot-slack.md).                                                              |
| `SQL`               | [Inline SQL editing](./metabot.md#inline-sql-editing) in the native editor.                                             |
| `Unknown`           | A conversation Metabase couldn't classify (distinct from no-source conversations, which appear as `(empty)` on charts). |

### Profiles

A profile is the configuration Metabot uses for a conversation: which prompt, which tools, and what it's allowed to do. The Conversations admin page, the **By profile** chart in [Stats](#stats), and the **Metabot Conversations** model (see [Building custom reports](#building-custom-reports)) all show the human-readable profile name. The [AI Usage Log](#building-custom-reports) model exposes the raw `profile_id` instead (e.g. `internal`, `transforms_codegen`, `embedding_next`).

| Profile              | What it does                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Internal`           | The default Metabot in the chat sidebar. Can build query-builder questions _and_ write SQL.                               |
| `NLQ`                | Natural-language querying only. Always returns a [query builder](../questions/query-builder/editor.md) result, never SQL. |
| `SQL`                | SQL writing only. Used by [inline SQL editing](./metabot.md#inline-sql-editing) and similar surfaces.                     |
| `Slackbot`           | The persona behind [Metabot in Slack](./metabot-slack.md).                                                                |
| `Embedding`          | The Metabot persona used inside [embedded Metabase](../embedding/start.md).                                               |
| `Transforms codegen` | Generates [transform](../data-studio/transforms/transforms-overview.md), SQL, or Python.                                  |
| `Documents`          | Generates content inside [Documents](../documents/start.md).                                                              |

## Conversations

_Admin > AI > Usage auditing > Conversations_

The Conversations page lists every Metabot conversation Metabase has on file, newest first.

### Filters

- **Date range**, **User**, **Group**, **Tenant**: same as the [Stats filters](#filters).

### Columns

Each row shows:

- **User**: who started the conversation.
- **Profile**: which Metabot persona answered.
- **Date**: when the conversation started.
- **Messages**: total messages, including both sides.
- **Tokens**: total LLM tokens spent.
- **Queries**: how many queries (SQL or query-builder) Metabot generated during the conversation.
- **Searches**: how many search-tool calls Metabot made.
- **IP**: the IP address the request came from.

You can sort by Date, Messages, or Tokens. Click any row to open the [conversation detail](#conversation-detail).

## Conversation detail

The detail view is a full audit of a single conversation. It includes:

- **Header**: start date, the person who chatted with Metabot, the profile Metabot used, the person's groups (including whether they're an admin), and tenant if applicable. From the **...** menu next to the person's name you can jump to all of their conversations, or to their account details.
- **Stat tiles**: Messages, Total tokens, Queries run, Searches.
- **Feedback** (if any): thumbs-up or thumbs-down and comments. The agent response that triggered the feedback is shown alongside.
- **Conversation transcript**: the full message-by-message exchange. Tool calls (search calls, query construction, etc.) are inlined. You can click "View" to open a modal with the info.
- **Queries generated**: every SQL or [query builder](../questions/query-builder/editor.md) (MBQL) query Metabot wrote during the conversation, with the referenced tables listed underneath. Hit **Visit** on a query to open the item in a new tab and run it yourself. Transform code-gen queries are shown read-only and can't be re-run from here.

### The `/inspect` shortcut

If you're an admin chatting with Metabot, type `/inspect` in the chat to jump straight from the current conversation to its detail page in Usage auditing.

## Building custom reports

Three [Usage Analytics](../usage-and-performance-tools/usage-analytics.md) models back the Usage auditing pages.

- [AI Usage Log](../usage-and-performance-tools/usage-analytics-reference.md#ai-usage-log): one row per LLM call.
- [Metabot Conversations](../usage-and-performance-tools/usage-analytics-reference.md#metabot-conversations): one row per conversation.
- [Metabot Messages](../usage-and-performance-tools/usage-analytics-reference.md#metabot-messages): one row per message.

Save your custom questions in the [Custom reports](../usage-and-performance-tools/usage-analytics.md#custom-reports-collection) sub-collection so the reports inherit the right permissions.

## What isn't tracked

[MCP](./mcp.md) activity isn't included in Usage auditing. MCP requests don't go through Metabot's conversation pipeline, so they don't generate conversations or token rows.

## Further reading

- [AI usage controls](./usage-controls.md)
- [AI settings](./settings.md)
- [Metabot](./metabot.md)
- [Metabot in Slack](./metabot-slack.md)
- [Usage analytics](../usage-and-performance-tools/usage-analytics.md)
- [Permissions overview](../permissions/start.md)
