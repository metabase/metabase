---
title: Embedding introduction
summary: Different ways you can embed charts and dashboards, or all of Metabase, in your app.
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Embedding introduction

{% include shared/in-page-promo-embedding-workshop.html %}

You can embed Metabase tables, charts, and dashboards—even Metabase's query builder—in your website or application. Here are the different ways you can embed Metabase:

- [Modular embedding](#modular-embedding)
- [Full app embedding](#full-app-embedding)
- [Public links](#public-links-and-embeds)

## Modular embedding

With [modular embedding](./modular-embedding.md), you can embed individual Metabase components in your web app. You can use guest embeds for basic functionality, or use SSO to take full advantage of Metabase.

You can use two different ways to authenticate modular embeds:

- [SSO](#modular-embedding)
- [Guest](#guest-embedding)

Here's a basic breakdown of what each auth type enables:

| Component                                             | SSO | Guest |
| ----------------------------------------------------- | --- | ----- |
| Chart                                                 | ✅  | ✅    |
| Chart with drill-through                              | ✅  | ❌    |
| Dashboard                                             | ✅  | ✅    |
| Dashboard with drill-through                          | ✅  | ❌    |
| [Query builder](../questions/query-builder/editor.md) | ✅  | ❌    |
| Browser to navigate collections                       | ✅  | ❌    |
| Metabot AI chat                                       | ✅  | ❌    |

Currently, you can't embed [documents](../documents/introduction.md).

### SSO embeds

With SSO, Metabase can know who's viewing what, which unlocks a lot of power. You can automatically apply [data permissions](../permissions/embedding.md), which means you can give people access to all the cool tools Metabase provides, and everyone will only ever see the data they're allowed to.

**When to use SSO**: You want to offer multi-tenant, self-service analytics, or you want to include the query builder, AI chat, drill-through, or a collection browser.

### Guest embedding

[Guest embeds](./guest-embedding.md) are a secure way to embed charts and dashboards. Guest embedding works on all Metabase plans, including OSS and Starter.

**When to use guest embeds**: simple embedding use cases where you don't want to offer ad-hoc querying or chart drill-through. To filter data relevant to the viewer, you can use guest embeds with [locked parameters](./guest-embedding.md#locked-parameters).

## Public links and embeds

If you'd like to share your data with the good people of the internet, admins can create a [public link](./public-links.md) or embed a question or dashboard directly in your website.

**When to use public links and embeds**: One-off charts and dashboards. Admins can use public links when you just need to show someone a chart or dashboard without giving people access to your Metabase. And you don't care who sees the data; you want to make the item available to everyone.

## Full app embedding

[Full app embedding](./full-app-embedding.md) allows you to embed the entire Metabase app in an iframe, and integrate Metabase SSO with your app's authentication.

## Comparison of embedding types

| Action                                                                                                               | [Modular SDK](./sdk/introduction.md) | [Modular SSO](./modular-embedding.md) | [Modular Guest](./guest-embedding.md) | [Full app](./full-app-embedding.md) | [Public](../embedding/public-links.md) |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------- | ----------------------------------- | -------------------------------------- |
| Charts and dashboards                                                                                                | ✅                                   | ✅                                    | ✅                                    | ✅                                  | ✅                                     |
| [Filter widgets](https://www.metabase.com/glossary/filter-widget)                                                    | ✅                                   | ✅                                    | ✅                                    | ✅                                  | ✅                                     |
| Export results\*                                                                                                     | ✅                                   | ✅                                    | ✅                                    | ✅                                  | ✅                                     |
| [Locked filters](./static-embedding-parameters.md#restricting-data-in-a-static-embed-with-locked-parameters)          | ❌                                   | ❌                                    | ✅                                    | ❌                                  | ❌                                     |
| [Data segregation](../permissions/embedding.md)                                                                      | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
| [Drill-through menu](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/drill-through) | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
| [Query builder](../questions/query-builder/editor.md)                                                                | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
| [Basic appearance customization](../configuring-metabase/appearance.md)\*\*                                          | ✅                                   | ✅                                    | ✅                                    | ✅                                  | ✅                                     |
| [Advanced theming](./appearance.md)                                                                                  | ✅                                   | ✅                                    | ❌                                    | ❌                                  | ❌                                     |
| [Usage analytics](../usage-and-performance-tools/usage-analytics.md)                                                 | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |
| Embed individual Metabase components                                                                                 | ✅                                   | ✅                                    | ❌                                    | ❌                                  | ❌                                     |
| Manage access and interactivity per component                                                                        | ✅                                   | ✅                                    | ❌                                    | ❌                                  | ❌                                     |
| Custom layouts                                                                                                       | ✅                                   | ❌                                    | ❌                                    | ❌                                  | ❌                                     |
| Customize behavior with [plugins](./sdk/plugins.md)                                                                  | ✅                                   | ❌                                    | ❌                                    | ❌                                  | ❌                                     |
| AI chat                                                                                                              | ✅                                   | ✅                                    | ❌                                    | ✅                                  | ❌                                     |

\* Each embedding type allows data downloads by default, but only [Pro and Enterprise](https://www.metabase.com/pricing/) plans can disable data downloads.

\*\* Requires a [Pro and Enterprise](https://www.metabase.com/pricing/) plan for any embedding type.

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/metabase-basics/embedding/overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/metabase-basics/embedding/charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
- [Securing embedded Metabase](./securing-embeds.md).
