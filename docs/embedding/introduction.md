---
title: Embedding introduction
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Embedding introduction

You can embed Metabase tables, charts, and dashboards—even Metabase's query builder—in your website or application.

Here are the different ways you can embed Metabase.

{% include shared/in-page-promo-embedding-workshop.html %}

## Embedded analytics SDK with React

With the [Embedded analytics SDK](./sdk/introduction.md), you can embed individual Metabase components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

**When to use the Embedded analytics SDK**: you want the most control over how you embed Metabase in your React app.

## Embedded analytics JS

With [Embedded analytics JS](./embedded-analytics-js.md), you can embed individual Metabase components in your web app with JavaScript — no React required. Choose from dashboards, questions, or the query builder, and configure per‑component options like drill‑through, parameters, downloads, and theming. Embedded Analytics JS integrates with [SSO](securing-embeds.md) and [data permissions](../permissions/embedding.md).

**When to use Embedded analytics JS**: You want to [offer multi-tenant, self-service analytics](https://www.metabase.com/blog/why-full-app-embedding), you’re not using React (or want a drop‑in script) and want to embed Metabase components with per‑component controls and theming.

## Static embedding

Also known as signed embedding, [static embedding](./static-embedding.md) is a secure way to embed charts and dashboards.

**When to use static embedding**: you don't want to offer ad-hoc querying or chart drill-through. To filter data relevant to the viewer, you can use static embeds with [locked parameters](./static-embedding-parameters.md#locked-parameters-limit-the-values-available-to-other-editable-parameters).

## Public links and embeds

If you'd like to share your data with the good people of the internet, admins can create a [public link](./public-links.md) or embed a question or dashboard directly in your website.

**When to use public links and embeds**: public links and embeds are good for one-off charts and dashboards. Admins can use them when you just need to show someone a chart or dashboard without giving people access to your Metabase. And you don't care who sees the data; you want to make those stats available to everyone.

## Interactive embedding

[Interactive embedding](./interactive-embedding.md) allows you to embed the entire Metabase app in an iframe, and integrate Metabase SSO with your app's authentication.

## Comparison of embedding types

| Action                                                                                                                          | [SDK](./sdk/introduction.md) | [JS](./embedded-analytics-js.md) | [Interactive](./interactive-embedding.md) | [Static](./static-embedding.md) | [Public](../embedding/public-links.md) |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------- | ----------------------------------------- | ------------------------------- | -------------------------------------- |
| Display charts and dashboards                                                                                                   | ✅                           | ✅                               | ✅                                        | ✅                              | ✅                                     |
| Display interactive [filter widgets](https://www.metabase.com/glossary/filter-widget)                                           | ✅                           | ✅                               | ✅                                        | ✅                              | ✅                                     |
| Export results\*                                                                                                                | ✅                           | ✅                               | ✅                                        | ✅                              | ✅                                     |
| Restrict data with [locked filters](./static-embedding-parameters.md#restricting-data-in-a-static-embed-with-locked-parameters) | ❌                           | ❌                               | ❌                                        | ✅                              | ❌                                     |
| Restrict data with [row and column security](../permissions/row-and-column-security.md)                                         | ✅                           | ✅                               | ✅                                        | ❌                              | ❌                                     |
| Use the [drill-through menu](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/drill-through)    | ✅                           | ✅                               | ✅                                        | ❌                              | ❌                                     |
| Self-serve via [query builder](https://www.metabase.com/glossary/query-builder)                                                 | ✅                           | ✅                               | ✅                                        | ❌                              | ❌                                     |
| View usage of embeds with [usage analytics](../usage-and-performance-tools/usage-analytics.md)                                  | ✅                           | ✅                               | ✅                                        | ❌                              | ❌                                     |
| [Actions on dashboards](../dashboards/actions.md)                                                                               | ✅                           | ✅                               | ✅                                        | ❌                              | ❌                                     |
| Embed individual Metabase components                                                                                            | ✅                           | ✅                               | ❌                                        | ❌                              | ❌                                     |
| Manage access and interactivity per component                                                                                   | ✅                           | ✅                               | ❌                                        | ❌                              | ❌                                     |

\* Each embedding type allows data downloads by default, but only [Pro and Enterprise](https://www.metabase.com/pricing/) plans can disable data downloads.

### Embedded analytics SDK vs JS

When deciding between the Embedded analytics SDK and Embedded analytics JS: if your app uses React, you should use the SDK. Otherwise, use the JS library. The JS library uses the SDK under the hood, but you can have more control with React and the SDK.

## Switching from static embedding to Embedded Analytics JS

[Embedded Analytics JS](./embedded-analytics-js.md) requires authentication via single sign-on (SSO), so you'll need to set that up both in your Metabase and in your application's server. Check out our [Modular embedding authentication](../embedding/sdk/authentication.md).

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/metabase-basics/embedding/overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/metabase-basics/embedding/charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
- [Securing embedded Metabase](./securing-embeds.md)
