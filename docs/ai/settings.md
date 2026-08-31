---
title: AI settings
summary: Connect an AI provider and configure AI settings, including Metabot, collections, and tips for improving performance.
redirect_from:
  - /docs/latest/ai/sql-generation
---

# AI settings

_Admin > AI_

This page covers admin settings for AI features in Metabase, including [Metabot](./metabot.md). To limit _who_ can use Metabot, see [AI controls](./usage-controls.md).

## Enable AI features

AI features work on both Metabase Cloud and self-hosted Metabase, and connecting your own AI provider doesn't require a paid plan. To turn AI features on:

1. Go to **Admin > AI**.
2. In **Connect to an AI provider**, click **Add a provider**.
3. Pick a provider and fill in its credentials. See [Choose AI provider](#choose-ai-provider).
4. Click **Connect**.
5. Configure [Metabot](#configure-metabot) and the other AI features below.

When you bring your own key, Metabase checks the credentials against a model before it saves the connection, so a bad key gets caught when you connect, not the first time someone asks Metabot a question.

## Choose AI provider

_Admin > AI_

You pick which AI providers Metabase can use, and which model Metabot runs on.

- If you're **self-hosting Metabase** and want to use Metabot, you'll need to [bring your own AI API key](#bring-your-own-api-key).
- On **Metabase Cloud**, you can [bring your own AI API key](#bring-your-own-api-key), [use the Metabase AI service](#metabase-ai-service), or do both.

The providers you set up in AI settings power Metabase's built-in AI functionality, not the MCP server. [With the MCP server, your client provides the AI](mcp.md#with-the-mcp-server-your-client-provides-the-ai).

### Metabase AI service

On Metabase Cloud, you can have us manage the AI for you with our AI service.

Metabase's AI service is a good option if you don't have a preferred AI provider, or if you want to manage all your Metabase AI costs through Metabase. We (Metabase the company) select the models for you. We use internal benchmarks to determine which AI models work best for different tasks, and we're constantly iterating to improve performance.

If you use Metabase's AI service, you'll get charged based on token usage (in addition to your regular Metabase Cloud subscription fee). See [Pricing](https://www.metabase.com/pricing).

To use the Metabase AI service for Metabot:

1. Go to **Admin > AI**.
2. Click **Add a provider**, then pick **Metabase AI service**.
3. Agree to the terms of service.
4. Click **Connect**.

You can only connect the Metabase AI service once, so it stops showing up in the **Add a provider** grid after you've added it.

To stop the charges, remove the connection: click the **...** next to **Metabase AI service** in the provider list, then click **Remove**. You'll need to be an admin, since removing the connection cancels your Metabase AI service subscription. Its models stop showing up in the **Model** dropdown.

### Bring your own API key

You can bring your own credentials for any provider Metabase supports, from Anthropic and OpenAI to Amazon Bedrock and your own self-hosted vLLM server. For the full list, what each provider needs, and which models it serves, check out [Supported AI providers](./providers.md).

A provider your plan can't reach is greyed out in the grid and labeled **Unavailable**.

If you're interested in Metabase supporting more AI providers or models, let us know by submitting a [feature request](../troubleshooting-guide/requesting-new-features.md).

To connect a provider with your own API key:

1. Go to **Admin > AI**.
2. Click **Add a provider**.
3. Pick your provider.
4. Enter your **API key**. The **Where do I find this?** link opens your provider's key management page in a new tab.
5. Click **Connect**.

If you've already copied a key, you can skip picking a provider: paste the key anywhere on the provider grid, and Metabase will select the matching provider and fill the key in for you. Metabase recognizes Anthropic, OpenAI, and OpenRouter keys by their prefix. DeepSeek and Moonshot AI keys start with the same `sk-` prefix as OpenAI keys, so check which provider Metabase picked before you click **Connect**.

Once the connection saves, you can point [Metabot](./metabot.md) at any model it serves. SQL generation is the exception: it always runs on your Anthropic connection, whatever model you pick for Metabot. See [Semantic search and SQL generation don't follow the Model dropdown](#semantic-search-and-sql-generation-dont-follow-the-model-dropdown).

### Connect more than one provider

You can connect as many providers as you want. Once you've added your first one, the card is titled **AI providers** and the button reads **Add another provider**.

You can add more than one connection of the same type, like two Anthropic keys or two Azure deployments. Give each connection its own name so you can tell them apart: click **Advanced settings** in the connect form and fill in **Display name**. That name labels the connection in the **Model** dropdown, so "Anthropic" and "Anthropic (evals)" can sit side by side.

The one exception is the [Metabase AI service](#metabase-ai-service), which you can only connect once.

### Pick the model Metabot runs on

The **Model** dropdown below your provider list sets the model Metabot uses by default. It lists the models from each working connection, grouped by connection, so picking a model also picks which connection serves it.

If one connection's credentials stop working, only that connection reports an error. Models from your other connections still list, so you can move Metabot to a different provider without having to fix the broken connection first.

A connection that's missing a required setting shows a warning icon, and Metabot can't use it until you fill the setting in.

### Semantic search and SQL generation don't follow the Model dropdown

Two features read a fixed connection instead of following your **Model** selection:

- **Semantic search**, which ranks search results by meaning as well as by keyword, always runs on your OpenAI connection. Semantic search is only available on [paid plans](https://www.metabase.com/pricing).
- **SQL generation**, including [inline SQL editing](./metabot.md#inline-sql-editing), always runs on your Anthropic connection.

Neither feature falls back to a second connection of the same type. If you've added two OpenAI connections, semantic search uses the first one, and removing that connection stops semantic search even though the second one is still there. Metabot carries on with whatever model you picked. Metabase tells you which feature you're about to turn off when you confirm the removal.

### Edit or remove a provider connection

Each connection in the list has a **...** menu:

- **Edit**: change the connection's display name, credentials, or API base URL. You don't have to retype the API key. Metabase keeps the stored key unless you replace it.
- **Remove**: delete the connection and its saved credentials. If Metabot was running on a model from that connection, Metabot switches to a model from one of your remaining connections, or reports itself as unconfigured if there aren't any.

The [Metabase AI service](#metabase-ai-service) connection only offers **Remove**, since there are no credentials of your own to edit.

### Set provider credentials with environment variables

If you're self-hosting, you can configure a provider with [`MB_LLM_*` environment variables](../configuring-metabase/environment-variables.md) instead of the admin UI. A provider configured this way shows up in the list as a read-only connection that names the variables that set it, and it has no **...** menu.

An environment variable can also override a single field of a connection you manage in the UI. If you set only `MB_LLM_ANTHROPIC_API_BASE_URL`, for example, the base URL comes from the environment, and the rest of the connection stays editable.

To put the whole list under environment control, set [`MB_LLM_PROVIDERS`](../configuring-metabase/environment-variables.md#mb_llm_providers) to a JSON array of connections. The provider list is then read-only, so manage your connections by editing `MB_LLM_PROVIDERS` and restarting. The **Add a provider** button is still on the page, but saving a connection through it fails.

On Metabase Cloud, [contact support](https://www.metabase.com/help-premium) if you want environment variables set for your instance.

## Configure Metabot

_Admin > AI_

![Metabot settings](./images/ai-settings.png)

The **Metabot settings** card has two tabs — **Internal** and **Embedded** — so you can configure Metabot for your internal Metabase separately from [embedded](../embedding/introduction.md) Metabase contexts. That way you can, for example, use Metabot in your Metabase while not granting access to Metabot in your embedded Metabase. Each tab has its own enable toggle, verified-content setting, allowed collection, and prompt suggestions, all configured independently.

### Enable Metabot

_Internal tab._

Toggle [Metabot](./metabot.md) on or off for your Metabase. Metabot is enabled by default.

When enabled, Metabot is available to help people create questions, analyze data, and answer questions about your data. When disabled, the Metabot icon and keyboard shortcuts are hidden. To scope Metabot to specific user or tenant groups, or to cap token usage, see [AI controls](./usage-controls.md).

Toggling off Metabot only turns off in-app Metabot features. People can still use the [MCP server](./mcp.md) and [Agent API](./agent-api.md) if those are enabled.

### Enable Embedded Metabot

_Embedded tab._

The **Enable Embedded Metabot** toggle turns embedded Metabot on or off. The toggle affects both full-app embeds and modular embeds.

- [Full-app embedding](../embedding/full-app-embedding.md): The Metabot icon and keyboard shortcuts are only available when Metabot is enabled. Turning off Embedded Metabot will hide these icons and disable the keyboard shortcuts.
- [Modular embedding](../embedding/modular-embedding.md): The toggle doesn't add Metabot anywhere; you have to explicitly include a chat component (like the SDK's [`MetabotQuestion`](../embedding/ai-chat.md)) in your application. If, however, you've added a component, and you turn off the Embedded Metabot toggle, your chat component will stop working, so you should also remove or hide the component in your application.

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

If you're embedding the Metabot component in an app, you can point embedded Metabot at a different collection to use for creating queries. Click **Pick a different collection** to choose the collection (and its subcollections) that embedded Metabot searches for metrics, models, and saved questions.

Picking **Our analytics** is the same as picking no collection at all, so pick something narrower if you want the scoping to do anything. And once you set a collection, tables drop out of embedded Metabot's search results, so pick a collection with the metrics and models you want people building on.

This setting narrows where embedded Metabot searches; it's _not_ a substitute for setting permissions. Embedded Metabot can still read and query anything the person using it has permissions for. Embedded Metabot can also see the items that person viewed recently, whichever collection those live in. Restricting Metabot to [verified content](#verified-content) narrows those recent items to verified, official, and [Library](../data-studio/library.md) content, but it doesn't confine them to the collection you picked. To control what data people can get to in an embed, set [data permissions](../permissions/embedding.md). See also [Set up AI chat in Metabase](../embedding/ai-chat.md#set-up-ai-chat-in-metabase).

### Prompt suggestions

_Available on both the Internal and Embedded tabs, configured independently._

When people open a new Metabot chat, Metabase shows a few suggested prompts based on popular models and metrics in your instance.

Click **Regenerate suggested prompts** to generate a fresh set of prompts. You can also run individual prompts to test Metabot's answers, or delete prompts that aren't useful. The Internal and Embedded tabs each maintain their own set of suggestions, so regenerating on one tab doesn't affect the other.

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

If you're using the Metabase AI service, you can see how many Metabot requests people have made this month by going to **Admin > AI**.

If you aren't logged into the [Metabase Store](../cloud/accounts-and-billing.md), you'll need to log in to the store before you can view the usage. Once logged in to the store, go back to your Metabase and view the license page.

If you're using your own API key, you can track usage and costs through your AI provider's dashboard.

On Metabase Pro/Enterprise, you also get access to detailed [AI usage auditing](usage-auditing.md) with detailed breakdown of AI usage by user, tool, feature etc.

## Further reading

- [Using Metabot](metabot.md)
- [Supported AI providers](providers.md)
- [MCP server](mcp.md)
- [AI privacy](privacy.md)
- [AI access and usage controls](usage-controls.md)
- [AI usage auditing](usage-auditing.md)
- [Metabot customization](customization.md)
- [Metabot system prompts](system-prompts.md)
