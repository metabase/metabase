---
title: Embedding introduction
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Embedding introduction

You can embed Metabase tables, charts, and dashboards—even Metabase's query builder—in your website or application.

[Signed embedding](./signed-embedding.md) (also known as standalone embedding) and [full-app embedding](./full-app-embedding.md) are _secure_ ways to share your data with specific groups of people outside of your organization.

If you'd like to share your data with the good people of the internet, you can create a [public link](../questions/sharing/public-links.md) and embed that directly on your website.

## How embedding works

You'll need to put an iframe on your website to act as a window to your Metabase app. Different configurations of that embedded iframe will let you:

- [set up public access](../questions/sharing/public-links.md) to charts and dashboards,
- [require sign-in](./signed-embedding.md) to view personalized versions of those charts and dashboards, or
- [integrate with SSO and data permissions](./full-app-embedding.md) to enable self-service access to the underlying data.

## Comparison of embedding types

|                                                                                                          | [Public](../questions/sharing/public-links.md) | [Signed](./signed-embedding.md) | [Full-app](./full-app-embedding.md) |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------- | ----------------------------------- |
| Display charts and dashboards                                                                            | ✅                                             | ✅                              | ✅                                  |
| Display interactive [filter widgets](https://www.metabase.com/glossary/filter_widget)                    | ✅                                             | ✅                              | ✅                                  |
| Restrict data with [locked filters](./signed-embedding-parameters.md#restricting-data-in-a-signed-embed) | ❌                                             | ✅                              | ❌                                  |
| Restrict data with [sandboxes](../permissions/data-sandboxes.md)                                         | ❌                                             | ❌                              | ✅                                  |
| Drill-down using the [action menu](https://www.metabase.com/learn/questions/drill-through)               | ❌                                             | ❌                              | ✅                                  |
| Self-serve via [query builder](https://www.metabase.com/glossary/query_builder)                          | ❌                                             | ❌                              | ✅                                  |

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/embedding/embedding-overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/embedding/embedding-charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
