---
title: Embedding introduction
summary: Different ways you can embed charts and dashboards, or all of Metabase, in your app.
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Embedding introduction

You can embed Metabase tables, charts, dashboards, AI chat—even Metabase's query builder—in your website or application.

There are two ways to embed Metabase.

- [Modular embedding](#modular-embedding). Embed individual Metabase components, like questions, dashboards, and AI chat, so they seamlessly integrate with your app.
- [Full app embedding](#full-app-embedding). Embed the full Metabase app in an iframe, styled like your branding.

Most people go with modular embedding, so you can integrate Metabase components into your app.

## Modular embedding

With [modular embedding](./modular-embedding.md), you can embed individual Metabase components in your web app. You can use guest embeds for basic functionality, or use SSO to take full advantage of Metabase.

You can use two different ways to authenticate modular embeds:

- [SSO](#sso-embeds)
- [Guest](#guest-embedding)

### Web components or the React SDK?

You can set up modular embeds two ways: with web components, or with the React SDK.

If your app uses React, go with the SDK. The web components, which you can set up in the [in-app wizard](./modular-embedding.md), are built on top of the SDK, so either option works for a React app. The SDK just gives you more control: you can build custom layouts, and [customize behavior with plugins](./sdk/plugins.md). You can always start with web components and move to the SDK if you really need that extra customization.

Both options support SSO and guest embeds.

### SSO embeds

With SSO, Metabase can know who's viewing what, which unlocks a lot of power. You can automatically apply [data permissions](../permissions/embedding.md), which means you can give people access to all the cool tools Metabase provides, and everyone will only ever see the data they're allowed to.

**When to use SSO**: You want to offer multi-tenant, self-service analytics, or you want to include the query builder, AI chat, drill-through, or a collection browser.

If you're building a SaaS product with embedded analytics for multiple customers, you can keep customer data isolated with [Tenants](./tenants.md).

Creating accounts for these embedded users in your Metabase counts toward the accounts billed in your Metabase plan. But by letting your customers self-serve their data, you save time on developing bespoke charts. And you can charge _more_ for a premium analytics experience. If you plan on giving a lot of your customers self-service access to their data, you should consider an enterprise plan, with custom pricing that scales with your business.

### Guest embedding

[Guest embeds](./guest-embedding.md) are a secure way to embed charts and dashboards. Guest embedding works on all Metabase plans, including OSS and Starter.

**When to use guest embeds**: simple embedding use cases where you don't want to offer ad-hoc querying or chart drill-through. To filter data relevant to the viewer, you can use guest embeds with [locked parameters](./guest-embedding.md#locked-parameters).

## Comparison between SSO and Guest embeds

All SSO options require a Pro or Enterprise plan.

| Feature                                                                                   | SSO | Guest |
| ----------------------------------------------------------------------------------------- | --- | ----- |
| Charts                                                                                    | ✅  | ✅    |
| Dashboards                                                                                | ✅  | ✅    |
| [Filter widgets](https://www.metabase.com/glossary/filter-widget)                         | ✅  | ✅    |
| Export results\*                                                                          | ✅  | ✅    |
| [Basic appearance customization](../configuring-metabase/appearance.md)\*\*               | ✅  | ✅    |
| Row-level data segregation                                                                | ✅  | ✅    |
| [Drill-through menus](../questions/visualizations/drill-through.md)                       | ✅  | ❌    |
| [Query builder](../questions/query-builder/editor.md)                                     | ✅  | ❌    |
| [SQL editor](../questions/native-editor/writing-sql.md)                                   | ✅  | ❌    |
| [AI chat](./sdk/ai-chat.md)                                                               | ✅  | ❌    |
| [Collection browser](./sdk/collections.md)                                                | ✅  | ❌    |
| Advanced [Tenant](./tenants.md) and [permissions](../permissions/embedding.md) management | ✅  | ❌    |
| [Advanced theming](./appearance.md)                                                       | ✅  | ❌    |
| [Usage analytics](../usage-and-performance-tools/usage-analytics.md)                      | ✅  | ❌    |
| Customize layouts and behavior with [plugins](./sdk/plugins.md)                           | ✅  | ❌    |

**When to use public links and embeds**: One-off charts and dashboards. Admins can use public links when you just need to show someone a chart or dashboard without giving people access to your Metabase. And you don't care who sees the data; you want to make the item available to everyone.

## Full app embedding

[Full app embedding](./full-app-embedding.md) allows you to embed the entire Metabase app in an iframe, and integrate Metabase SSO with your app's authentication.

## Comparison of embedding types

| Action                                                                                                       | [Modular SDK](./sdk/introduction.md) | [Modular SSO](./modular-embedding.md) | [Modular Guest](./guest-embedding.md) | [Full app](./full-app-embedding.md) | [Public](../embedding/public-links.md) |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------- | ------------------------------------- | ----------------------------------- | -------------------------------------- |
| Charts and dashboards                                                                                        | ✅                                   | ✅                                    | ✅                                    | ✅                                  | ✅                                     |
| [Filter widgets](https://www.metabase.com/glossary/filter-widget)                                            | ✅                                   | ✅                                    | ✅                                    | ✅                                  | ✅                                     |
| Export results\*                                                                                             | ✅                                   | ✅                                    | ✅                                    | ✅                                  | ✅                                     |
| [Locked filters](./static-embedding-parameters.md#restricting-data-in-a-static-embed-with-locked-parameters) | ❌                                   | ❌                                    | ✅                                    | ❌                                  | ❌                                     |
| [Data segregation](../permissions/embedding.md)                                                              | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
| [Drill-through menu](../questions/visualizations/drill-through.md)                                           | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
| [Query builder](../questions/query-builder/editor.md)                                                        | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
| [Basic appearance customization](../configuring-metabase/appearance.md)\*\*                                  | ✅                                   | ✅                                    | ✅                                    | ✅                                  | ✅                                     |
| [Advanced theming](./appearance.md)                                                                          | ✅                                   | ✅                                    | ❌                                    | ❌                                  | ❌                                     |
| [Usage analytics](../usage-and-performance-tools/usage-analytics.md)                                         | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
| Embed individual Metabase components                                                                         | ✅                                   | ✅                                    | ❌                                    | ❌                                  | ❌                                     |
| Manage access and interactivity per component                                                                | ✅                                   | ✅                                    | ❌                                    | ❌                                  | ❌                                     |
| Custom layouts                                                                                               | ✅                                   | ❌                                    | ❌                                    | ❌                                  | ❌                                     |
| Customize behavior with [plugins](./sdk/plugins.md)                                                          | ✅                                   | ❌                                    | ❌                                    | ❌                                  | ❌                                     |
| [Custom visualizations](../questions/visualizations/custom.md)                                               | ✅                                   | ❌                                    | ❌                                    | ❌                                  | ❌                                     |
| AI chat                                                                                                      | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
>>>>>>> master

\* Each embedding type allows data downloads by default, but only [Pro and Enterprise](https://www.metabase.com/pricing/) plans can disable data downloads.

\*\* Requires a [Pro and Enterprise](https://www.metabase.com/pricing/) plan for any embedding type.

## Resources for AI agents

If you're using an AI agent to help you embed Metabase in your app, check out [AI agent resources](./ai-agent-resources.md).

## Tracking embed usage

{% include plans-blockquote.html feature="Tracking embed usage" %}

[Usage Analytics](../usage-and-performance-tools/usage-analytics.md) tracks embed usage, including embedding context, authentication methods, hostname, and other metadata. Check out the [Embedding usage dashboard](../usage-and-performance-tools/usage-analytics-reference.md#embedding-usage).

For information about the anonymous usage data Metabase collects from embedded components, see [Embedding telemetry](../installation-and-operation/information-collection.md#embedding-telemetry).

## Embedding limitations

<<<<<<< HEAD
Currently, you can't embed [documents](../documents/introduction.md) (though you can create [public documents](./public-links.md)).

## Full app embedding

[Full app embedding](./full-app-embedding.md) allows you to embed the entire Metabase app in an iframe, and integrate Metabase SSO with your app's authentication.

## Public links and embeds

If you'd like to share your data with the good people of the internet, admins can create a [public link](./public-links.md) or embed a question or dashboard directly in your website. Public links aren't really an embedding setup—there's no authentication, and anyone with the link can see the data.

**When to use public links and embeds**: one-off charts and dashboards. Admins can use public links when you just need to show someone a chart or dashboard without giving people access to your Metabase. And you don't care who sees the data; you want to make the item available to everyone.
=======
- Currently, you can't embed [documents](../documents/introduction.md) (though you can create [public documents](./public-links.md)).
- Only the [Modular embedding SDK](./sdk/introduction.md) renders [custom visualizations](../questions/visualizations/custom.md), and only ones you allowlist with the [`allowedCustomVisualizations` prop](./sdk/config.md#custom-visualizations). In other embedding types, any card that uses a custom visualization falls back to the default visualization for the query's results.
>>>>>>> master

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/metabase-basics/embedding/overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/metabase-basics/embedding/charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
- [Securing embedded Metabase](./securing-embeds.md).
