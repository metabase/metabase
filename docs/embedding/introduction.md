---
title: Embedding introduction
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Embedding introduction

You can embed Metabase tables, charts, and dashboards—even Metabase's query builder—in your website or application.

## Different ways to embed

There are three ways to embed Metabase in your app:

- [Interactive embedding](#interactive-embedding)
- [Static embedding](#static-embedding)
- [Public links and embeds](#public-links-and-embeds)

## Interactive embedding

Interactive embedding is the only kind of embedding that [integrates with SSO and data permissions](./interactive-embedding.md) to enable true self-service access to the underlying data.

**When to use interactive embedding**: when you want to [offer multi-tenant, self-service analytics](https://www.metabase.com/blog/why-full-app-embedding). With interactive embedding, people can create their own questions, dashboards, models, and more, all in their own data sandbox.

## Static embedding

Also known as signed embedding, [static embedding](./static-embedding.md) is a secure way to embed charts and dashboards.

**When to use static embedding**: you don’t want to give people ad hoc query access to their data for whatever reason, or you want to present data that applies to all of your tenants at once. For example, say you want to showcase some benchmarking stats: if you just want to make those stats available exclusively to your customers, you could use a signed embed.

## Public links and embeds

If you'd like to share your data with the good people of the internet, you can create a [public link](../questions/sharing/public-links.md) or embed a question or dashboard directly in your website.

**When to use public links and embeds**: public links and embeds are good for one-off charts and dashboards. Use them when you just need to show someone a chart or dashboard without giving people access to your Metabase. And you don't care who sees the data; you want to make those stats available to everyone.

## Comparison of embedding types

| Action                                                                                                   | [Interactive](./interactive-embedding.md) | [Static](./static-embedding.md) | [Public](../questions/sharing/public-links.md) |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------- | ---------------------------------------------- |
| Display charts and dashboards                                                                            | ✅                                         | ✅                               | ✅                                              |
| Display interactive [filter widgets](https://www.metabase.com/glossary/filter_widget)                    | ✅                                         | ✅                               | ✅                                              |
| Restrict data with [locked filters](./static-embedding-parameters.md#restricting-data-in-a-static-embed) | ❌                                         | ✅                               | ❌                                              |
| Restrict data with [sandboxes](../permissions/data-sandboxes.md)                                         | ✅                                         | ❌                               | ❌                                              |
| Use the [drill-through menu](https://www.metabase.com/learn/questions/drill-through)                     | ✅                                         | ❌                               | ❌                                              |
| Self-serve via [query builder](https://www.metabase.com/glossary/query_builder)                          | ✅                                         | ❌                               | ❌                                              |
| View usage of embeds with [usage analytics](../usage-and-performance-tools/usage-analytics.md)           | ✅                                         | ❌                               | ❌                                              |
| [Actions on dashboards](../dashboards/actions.md)                                                        | ✅                                         | ❌                               | ❌                                              |

## Switching from static to interactive embedding

[Interactive embedding](./interactive-embedding.md) requires authentication via single sign-on (SSO), so you'll need to set that up both in your Metabase and in your application's server. Check out our [Interactive embedding quick start](https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start).

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/embedding/embedding-overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/embedding/embedding-charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
