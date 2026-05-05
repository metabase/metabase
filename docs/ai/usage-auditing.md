---
title: AI usage auditing
summary: "See token and message counts, chat logs, and more."
---

# AI usage auditing

{% include plans-blockquote.html feature="AI usage auditing" %}

_Admin > AI > Usage auditing_

Admins can get an overview of human-robot interactions, from high-level stats like total token counts down to visibility into actual conversations.

Usage auditing includes:

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
- **Tenant**: limit to a single [tenant](../embedding/tenants.md). Only shows up if [tenants](../embedding/tenants.md) are enabled.

### Metrics

Pick what you want to count:

- **Conversations**: distinct Metabot chats. Each visit to the chat sidebar that produces a back-and-forth is one conversation.
- **Tokens**: total tokens (input and output) consumed by LLM calls.
- **Messages**: every message exchanged, both from people and from Metabot.

For each metric, you'll see the same set of charts:

- **By day** and **By hour**: "Being with you and not being with you is the only way I have to measure time." - Jorge Luis Borges.
- **By source**: _where_ in Metabase the request came from. See [Sources and profiles](#sources-and-profiles) below.
- **By profile**: _which_ Metabot persona answered. See [Sources and profiles](#sources-and-profiles) below.
- **Users with most ...**, **Groups with most ...**, **IP addresses with most ...**: top-N rankings.
- **Tenants with most ...**: only shown when tenants are enabled.

Clicking a bar or point on most charts deep-links you into the [Conversations list](#conversations) with the corresponding filter applied (so clicking on a name will take you to that person's conversations).

## Sources and profiles

Source and profile both describe a conversation, but they answer different questions:

- **Source** is _where_ the request came from in Metabase.
- **Profile** is _which agent persona_ answered it.

They often line up (a conversation that started in Slack is handled by the Slackbot profile), but they don't have to. A conversation started from the Metabot chat sidebar might be handled by the **Internal**, **NLQ**, or **SQL** profile depending on what the user asked.

### Sources

| Source              | Where it comes from                                                         |
| ------------------- | --------------------------------------------------------------------------- |
| `Metabot`           | The Metabot chat sidebar inside Metabase.                                   |
| `Documents`         | Content generation inside [Documents](../documents/start.md).               |
| `Suggested Prompts` | Background generation of suggested prompts.                                 |
| `Slackbot`          | Conversations that started in [Slack](./metabot-slack.md).                  |
| `SQL`               | [Inline SQL editing](./metabot.md#inline-sql-editing) in the native editor. |
| `Unknown`           | A conversation Metabase couldn't classify.                                  |

### Profiles

A profile is the configuration Metabot uses for a conversation: which prompt, which tools, and what it's allowed to do.

| Profile              | What it does                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Internal`           | The default Metabot in the chat sidebar. Can build query-builder questions _and_ write SQL.                               |
| `NLQ`                | Natural-language querying only. Always returns a [query builder](../questions/query-builder/editor.md) result, never SQL. |
| `SQL`                | SQL writing only. Used by [inline SQL editing](./metabot.md#inline-sql-editing) and similar surfaces.                     |
| `Slackbot`           | The persona behind [Metabot in Slack](./metabot-slack.md).                                                                |
| `Embedding`          | The Metabot persona used inside [embedded Metabase](../embedding/start.md).                                               |
| `Transforms codegen` | Generates [transform](../data-studio/transforms/transforms-overview.md) SQL or Python.                                    |
| `Documents`          | Generates content inside [Documents](../documents/start.md).                                                              |

## Conversations

_Admin > AI > Usage auditing > Conversations_

The Conversations page lists every Metabot conversation Metabase has on file, newest first.

### Filters

- **Date range**, **User**, **Group**, **Tenant**: same as the [Stats filters](#filters).

To filter by source or profile, drill in from a [Stats](#stats) chart — clicking a source or profile bar deep-links here with that filter applied.

### Columns

Each row shows:

- **User**: who started the conversation.
- **Profile**: which Metabot persona answered.
- **Date**: when the conversation started.
- **Messages**: total messages, including both sides.
- **Tokens**: total LLM tokens spent.
- **Queries**: how many queries (SQL or query-builder) Metabot generated during the conversation.
- **Searches**: how many search-tool calls Metabot made.
- **IP**: the IP address the request came from. Useful for spotting traffic from unexpected places.

You can sort by Date, Messages, or Tokens. Click any row to open the [conversation detail](#conversation-detail).

## Conversation detail

The detail view is a full audit of a single conversation. It includes:

- **Header**: start date, the user the conversation is with, their profile, their groups (including whether they're an admin), and tenant if applicable. From the **...** menu next to the user's name you can jump to all of that user's conversations or to their account details.
- **Stat tiles**: Messages, Total tokens, Queries run, Searches.
- **Feedback**: any thumbs-up or thumbs-down a user submitted, with the issue category they picked and any free-form text. The agent response that triggered the feedback is shown alongside.
- **Conversation transcript**: the full message-by-message exchange. Tool calls (search calls, query construction, etc.) are expanded inline so you can see what Metabot was doing under the hood, including the user context it had — useful for understanding why a query came out a certain way for a user with [row and column security](../permissions/row-and-column-security.md), [impersonation](../permissions/impersonation.md), or custom [user attributes](../people-and-groups/managing.md#adding-a-user-attribute). The transcript is read-only.
- **Queries generated**: every SQL or [query builder](../questions/query-builder/editor.md) (MBQL) query Metabot wrote during the conversation, with the referenced tables listed underneath. Hit **Run** on a query to open it in a new tab and execute it yourself. Transform code-gen queries are shown read-only and can't be re-run from here.
- **Open in Slack**: for Slack-sourced conversations, a link back to the original Slack thread.

### The `/inspect` shortcut

If you're an admin chatting with Metabot, type `/inspect` in the chat to jump straight from the current conversation to its detail page in Usage auditing.

## Building custom reports

Three [Usage Analytics](../usage-and-performance-tools/usage-analytics.md) models back the Usage auditing pages. See the [Usage analytics reference](../usage-and-performance-tools/usage-analytics-reference.md) for the full column list of each:

- [AI Usage Log](../usage-and-performance-tools/usage-analytics-reference.md#ai-usage-log): one row per LLM call.
- [Metabot Conversations](../usage-and-performance-tools/usage-analytics-reference.md#metabot-conversations): one row per conversation.
- [Metabot Messages](../usage-and-performance-tools/usage-analytics-reference.md#metabot-messages): one row per message.

Save your custom questions in the [Custom reports](../usage-and-performance-tools/usage-analytics.md#custom-reports-collection) sub-collection so they inherit the right permissions.

## What isn't tracked yet

[MCP](./mcp.md) activity isn't included in Usage auditing. MCP requests don't go through Metabot's conversation pipeline, so they don't generate conversations or token rows.

## Further reading

- [AI usage controls](./usage-controls.md)
- [AI settings](./settings.md)
- [Metabot](./metabot.md)
- [Metabot in Slack](./metabot-slack.md)
- [Usage analytics](../usage-and-performance-tools/usage-analytics.md)
- [Permissions overview](../permissions/start.md)
