---
title: Embedding introduction
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Embedding introduction

You can embed Metabase tables, charts, and dashboards—even Metabase's query builder—in your website or application.

Here are the different ways you can embed Metabase.

{% include shared/in-page-promo-embedding-workshop.html %}

## Modular embedding

With [modular embedding](./modular-embedding.md), you can embed individual Metabase components in your web app. Choose from dashboards, questions, or the query builder, and configure per‑component options like drill‑through, parameters, downloads, and theming. Modular embedding integrates with [SSO](securing-embeds.md) and [data permissions](../permissions/embedding.md).

**When to use modular embedding**: You want to [offer multi-tenant, self-service analytics](https://www.metabase.com/blog/why-full-app-embedding), you want a drop‑in script, and want to embed Metabase components with per‑component controls and theming.

## Static embedding

Also known as signed embedding, [static embedding](./static-embedding.md) is a secure way to embed charts and dashboards.

**When to use static embedding**: you don't want to offer ad-hoc querying or chart drill-through. To filter data relevant to the viewer, you can use static embeds with [locked parameters](./static-embedding-parameters.md#locked-parameters-limit-the-values-available-to-other-editable-parameters).

## Public links and embeds

If you'd like to share your data with the good people of the internet, admins can create a [public link](./public-links.md) or embed a question or dashboard directly in your website.

**When to use public links and embeds**: public links and embeds are good for one-off charts and dashboards. Admins can use them when you just need to show someone a chart or dashboard without giving people access to your Metabase. And you don't care who sees the data; you want to make those stats available to everyone.

## Full app embedding

[Full app embedding](./full-app-embedding.md) allows you to embed the entire Metabase app in an iframe, and integrate Metabase SSO with your app's authentication.

## Comparison of embedding types

| Action                                                                                                                          | [React SDK](./sdk/introduction.md) | [Modular](./modular-embedding.md) | [Full app](./full-app-embedding.md) | [Static](./static-embedding.md) | [Public](../embedding/public-links.md) |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------- | ----------------------------------- | ------------------------------- | -------------------------------------- |
| Display charts and dashboards                                                                                                   | ✅                                 | ✅                                | ✅                                  | ✅                              | ✅                                     |
| Display interactive [filter widgets](https://www.metabase.com/glossary/filter-widget)                                           | ✅                                 | ✅                                | ✅                                  | ✅                              | ✅                                     |
| Export results\*                                                                                                                | ✅                                 | ✅                                | ✅                                  | ✅                              | ✅                                     |
| Restrict data with [locked filters](./static-embedding-parameters.md#restricting-data-in-a-static-embed-with-locked-parameters) | ❌                                 | ❌                                | ❌                                  | ✅                              | ❌                                     |
| [Data segregation](../permissions/embedding.md)                                                                                 | ✅                                 | ✅                                | ✅                                  | ❌                              | ❌                                     |
| Use the [drill-through menu](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/drill-through)    | ✅                                 | ✅                                | ✅                                  | ❌                              | ❌                                     |
| Self-serve via [query builder](../questions/query-builder/editor.md)                                                            | ✅                                 | ✅                                | ✅                                  | ❌                              | ❌                                     |
| [Basic appearance customization](../configuring-metabase/appearance.md)\*\*                                                     | ✅                                 | ✅                                | ✅                                  | ✅                              | ✅                                     |
| [Advanced theming](./sdk/appearance.md)                                                                                         | ✅                                 | ✅                                | ❌                                  | ❌                              | ❌                                     |
| View usage of embeds with [usage analytics](../usage-and-performance-tools/usage-analytics.md)                                  | ✅                                 | ✅                                | ✅                                  | ❌                              | ❌                                     |
| Embed individual Metabase components                                                                                            | ✅                                 | ✅                                | ❌                                  | ❌                              | ❌                                     |
| Manage access and interactivity per component                                                                                   | ✅                                 | ✅                                | ❌                                  | ❌                              | ❌                                     |
| Custom layouts                                                                                                                  | ✅                                 | ❌                                | ❌                                  | ❌                              | ❌                                     |
| Customize behavior with [plugins](./sdk/plugins.md)                                                                             | ✅                                 | ❌                                | ❌                                  | ❌                              | ❌                                     |

\* Each embedding type allows data downloads by default, but only [Pro and Enterprise](https://www.metabase.com/pricing/) plans can disable data downloads.

\*\* Requires a [Pro and Enterprise](https://www.metabase.com/pricing/) plan for any embedding type.

## Switching from static embedding to Modular embedding

[Modular embedding](./modular-embedding.md) requires authentication via single sign-on (SSO), so you'll need to set that up both in your Metabase and in your application's server. Check out our [Modular embedding authentication](../embedding/sdk/authentication.md).

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/metabase-basics/embedding/overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/metabase-basics/embedding/charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
- [Securing embedded Metabase](./securing-embeds.md)
