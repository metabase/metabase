---
title: AI settings
summary: Connect an AI provider and configure AI settings, including Metabot, collections, and tips for improving performance.
redirect_from:
  - /docs/latest/ai/sql-generation
---

# AI settings

> AI features are available on [Metabase Cloud](https://www.metabase.com/features/metabot-ai) and on self-hosted Metabase, using either the Metabase AI service or your own AI provider API key.

_Admin > AI_

This page covers admin settings for AI features in Metabase, including [Metabot](./metabot.md). To limit _who_ can use Metabot, see [AI controls](./usage-controls.md).

## Enable AI features

AI features are available on both Metabase Cloud and self-hosted Metabase. To turn them on:

1. Go to **Admin settings > AI**.
2. In **Connect to an AI provider**, choose a **Provider**:
   - **Metabase**: The Metabase AI service. Metabase picks a benchmarked, cost-effective model for you, and billing is managed through your Metabase account. Agree to the **Metabase AI add-on Terms of Service** and click **Connect**.
   - Another supported provider. See [bring your own API key](#bring-your-own-api-key).
3. Once connected, configure [Metabot](#configure-metabot) and other AI features below.

> The Metabase AI add-on only appears in your Metabase Store account after you've connected to the Metabase AI service in **Admin settings > AI**. If you're on a Pro trial and don't see the add-on in **Manage plan**, connect it from Admin first; the Store will reflect it after.

## Bring your own API key

_Admin > AI_

To enable AI features with your own API key:

1. Go to **Admin > AI**.
2. Select your **Provider**.
3. Enter your **API key**. The **Get or manage keys in [provider]** link opens your provider's key management page in a new tab.
4. Click **Connect**.
5. Select a **Model** from the dropdown. Available models are fetched from the provider using your API key.

When your connection is active, the provider card header shows **Connected to [provider]** (for example, "Connected to Anthropic") next to a green status dot. With your key connected, you get access to [Metabot](./metabot.md), [inline SQL generation](./metabot.md#inline-sql-editing), the [MCP server](./mcp.md), and the [Agent API](./agent-api.md).

To clear your provider connection, click **Disconnect**. Disconnecting removes the stored API key and turns off any AI features that depend on the provider.

### Supported providers

Currently, Metabase only supports models from Anthropic.

## Configure Metabot

_Admin > AI > Metabot settings_

![Metabot settings](./images/ai-settings.png)

The **Metabot settings** card has two tabs — **Internal** and **Embedded** — so you can configure Metabot for your internal Metabase separately from [embedded](../embedding/introduction.md) Metabase contexts. That way you can, for example, use Metabot in your Metabase while not granting access to Metabot in your embedded Metabase. Each tab has its own enable toggle, verified-content setting, allowed collection, and prompt suggestions, all configured independently.

### Enable Metabot

_Internal tab._

Toggle [Metabot](./metabot.md) on or off for your Metabase. Metabot is enabled by default.

When enabled, Metabot is available to help people create questions, analyze data, and answer questions about your data. When disabled, the Metabot icon and keyboard shortcuts are hidden. To scope Metabot to specific user or tenant groups, or to cap token usage, see [AI controls](./usage-controls.md).

Toggling off Metabot only turns off in-app Metabot features. People can still use the [MCP server](./mcp.md) and [Agent API](./agent-api.md) if those are enabled.

### Enable Embedded Metabot

_Embedded tab._

The **Embedded Metabot is enabled** toggle turns embedded Metabot on or off. The toggle affects both full-app embeds and modular embeds.

- [Full-app embedding](../embedding/full-app-embedding.md): The Metabot icon and keyboard shortcuts are only available when Metabot is enabled. Turning off Embedded Metabot will hide these icons and disable the keyboard shortcuts.
- [Modular embedding](../embedding/modular-embedding.md): The toggle doesn't add Metabot anywhere; you have to explicitly include a chat component (like the SDK's [`MetabotQuestion`](../embedding/sdk/ai-chat.md)) in your application. If, however, you've added a component, and you turn off the Embedded Metabot toggle, your chat component will stop working, so you should also remove or hide the component in your application.

### Verified content

_Available on both the Internal and Embedded tabs, configured independently._

Admins on Pro and Enterprise plans can tell Metabot to only work with [models](../data-modeling/models.md) and [metrics](../data-modeling/metrics.md) that have been [verified](../exploration-and-organization/content-verification.md).

Restricting Metabot to verified models and metrics (and only models and metrics) helps Metabot produce more reliable answers, since you know someone has at least vetted the data Metabot can use.

### Collection for natural language querying

_Internal tab._

Select a collection (including its subcollections) to limit which collections Metabot searches during [AI exploration](../ai/metabot.md#ai-exploration). Click **Pick a different collection** to change the selection.

This setting only affects conversations started from **+ New > AI exploration**.

People can still @-mention items outside of this collection when prompting in AI exploration. Metabot can also see the person's current context (for example, Metabot will know about the dashboard they're currently viewing, even if the dashboard is outside the selected collection).

### Collection Embedded Metabot can use

_Embedded tab._

If you're embedding the Metabot component in an app, you can specify a different collection that embedded Metabot is allowed to use for creating queries. Click **Pick a different collection** to choose the collection (and its subcollections) that embedded Metabot can query.

### Prompt suggestions

_Available on both the Internal and Embedded tabs, configured independently._

When people open a new Metabot chat, Metabase shows a few suggested prompts based on popular models and metrics in your instance.

Click **Regenerate suggested prompts** to generate a fresh set of prompts. You can also run individual prompts to test Metabot's answers, or delete prompts that aren't useful. The Internal and Embedded tabs each maintain their own set of suggestions, so regenerating on one tab doesn't affect the other.

## MCP server settings

Use the **MCP server** toggle to turn external access to the [MCP server](./mcp.md) on or off.

### Supported MCP clients

Under **Supported MCP clients**, switch on any clients you want to allow:

- **Claude** (Claude Desktop and Claude on the web)
- **Cursor and VS Code**
- **ChatGPT**

Toggling on a client automatically adds that client's sandbox domains to Metabase's CORS allowlist, which is what lets browser-based MCP clients make cross-origin requests to your Metabase.

Some clients run outside the browser (like Claude Code on your own machine) and don't need a CORS allowlist entry. You can connect those clients without toggling anything on (assuming you've turned on the main MCP server setting).

### Custom MCP client domains

If you run a self-hosted MCP client or one that isn't in the supported list, add its domain to the **Custom MCP client domains** field. Separate values with a space, for example:

```
https://mcp.internal.example.com https://*.staging.example.com
```

The field accepts wildcards (`*`) for subdomains. Changes take effect in about a minute. Might be a good time to get up and pour yourself a glass of water.

## Agent API settings

Use the **Agent API** toggle to turn external access to the [Agent API](./agent-api.md) on or off.

## Disable all AI features

The **Disable all AI features** toggle at the bottom of the AI features page is a master kill switch. When turned on, it hides all AI features across your instance — Metabot, inline SQL generation, the MCP server, the Agent API, and any embedded chat components — regardless of the individual toggles above.

Use this toggle for an instance-wide shut-off without having to disconnect your provider or change each feature's own toggle. Turn it off again to restore your previous configuration.

For more granular options, check out [AI usage controls](./usage-controls.md).

## Tips for making the most of Metabot

The best thing you can do to improve Metabot's performance is to prep your data like you would for onboarding a new (human) hire to your data. In practice, this means you should:

- [Add descriptions for your data and content](#add-descriptions-for-your-data-and-content)
- [Make sure the semantic types for each field are correct](#make-sure-the-semantic-types-for-each-field-are-correct)
- [Define domain-specific terms in the glossary](#define-domain-specific-terms-in-the-glossary)

### Add descriptions for your data and content

Add descriptions to your [models](../data-modeling/models.md#add-metadata-to-columns-in-a-model), [metrics](../data-modeling/metrics.md), [dashboards](../dashboards/introduction.md), and [questions](../questions/introduction.md). Write descriptions to provide context, define terms, and explain business logic.

Admins can also curate [table metadata](../data-modeling/metadata-editing.md) by adding descriptions for tables and their fields.

For example, here's a decent description for an ID field that provides additional context for the data:

```txt
This is a unique ID for the product. It is also called the "Invoice number" or "Confirmation number" in customer facing emails and screens.
```

You can even ask Metabot to write descriptions for you. But Metabot will only have access to the data in the database. It can't know things like "this ID is called the 'Invoice number' in the web app", which is the kind of contextual information worth documenting.

### Make sure the semantic types for each field are correct

Make sure the semantic types for each field accurately describe the field's "meaning". For example, if you have a field like `created_at`, you'd want the column type to be Creation date.

Metabase will try to set semantic types automatically, but you should confirm that each field has the relevant semantic type. See [Data types and semantic types](../data-modeling/semantic-types.md). You can also set semantic types for [models](../data-modeling/models.md#add-metadata-to-columns-in-a-model).

### Define domain-specific terms in the glossary

Add your organization's terminology, acronyms, and business-specific terms to the [glossary](../exploration-and-organization/data-model-reference.md#glossary). When you submit a prompt, Metabot can look up terms in the glossary to better understand your request.

For example, if you define "MRR" as "Monthly Recurring Revenue" in your glossary, Metabot will know what you mean when you ask "What's our MRR for Q4?" This is especially helpful for industry-specific jargon, internal product names, or abbreviations unique to your organization.

## Metabot permissions are Metabase permissions

Metabot inherits the permissions of the person it's chatting with, so you don't need to set permissions specifically for Metabot. Whenever someone uses Metabot, Metabot can only see what that person has permissions to see and do.

In other words, to restrict what data Metabot can see for each person, simply apply [data](../permissions/data.md) and [collection](../permissions/collections.md) permissions to their groups as you would normally, and those permissions will apply to their use of Metabot as well.

## Viewing Metabot usage

If you're using the Metabase AI service, you can see how many Metabot requests people have made this month by going to **Admin > Settings > License**.

If you aren't logged into the [Metabase Store](../cloud/accounts-and-billing.md), you'll need to log in to the store before you can view the usage. Once logged in to the store, go back to your Metabase and view the license page.

The **Metabot AI requests used, this month (updated daily)** field shows how many requests your Metabase has used this month. Each message sent to Metabot counts as a request.

If you're using your own API key, you can track usage and costs through your AI provider's dashboard.

## Choosing the AI model

If you're using your own API key, you can choose which AI model Metabase uses when you [bring your own API key](#bring-your-own-api-key).

When using the Metabase AI service, Metabase selects models automatically. We use internal benchmarks to determine which AI models work best for different tasks, and we're constantly iterating to improve performance.

## Privacy

When using the Metabase AI service, your questions and conversations remain private to your Metabase -- we don't send your data to external services. We do collect some metadata to gauge and improve usage.

If you're using your own API key, your prompts and data are sent to your selected AI provider. Review your provider's data handling and privacy policies. When using the [MCP server](./mcp.md), query results are sent to the connected MCP client.

In both cases, Metabot can't create assets or write data. If you [submit feedback](./metabot.md#giving-feedback-on-metabot-responses), the form you send may contain sensitive data from your conversation.

### What Metabot can see

Metabot has access to your Metabase metadata and some data values to help answer your questions:

- **Table, Question, Model, Dashboard, and Metric metadata**: Metabot can see the structure and configuration of your content.
- **Sample field values**: When you ask questions like "Filter everyone from Wisconsin," Metabot might check the values in the state field to understand how the data is stored (like "WI" vs "Wisconsin"). See [syncs](../databases/sync-scan.md).
- **Timeseries data**: For chart analysis, Metabot might see the timeseries data used to draw certain visualizations, depending on the chart type.

This data may be included when you [submit feedback](./metabot.md#giving-feedback-on-metabot-responses).
