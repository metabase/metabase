---
title: Introduction
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Introduction

Embedding allows people to view your Metabase app inside another web app (such as your company's website).

[Signed embedding](./signed-embedding.md) (also known as standalone embedding) and [full-app embedding](./full-app-embedding.md) are _secure_ ways to share your data with specific groups of people outside of your organization.

If you'd like to share your data with the good people of the internet, you can create a [public link](../questions/sharing/public-links.md) and embed that directly on your website.

## How embedding works

You'll need to put an iframe on your website to act as a window to your Metabase app. Then, you can configure things like:

- what Metabase charts and dashboards to display in the iframe,
- whether people need to sign in to view those charts and dashboards, and
- how much people can interact with your data (using Metabase features that are accessible through the iframe).

## Comparison of embedding types

|                                                                                                            | [Public](../questions/sharing/public-links.md) | [Signed](./signed-embedding.md) | [Full-app](./full-app-embedding.md) |
| -----------------------------------------------------------------------------------------------------------| -----------------------------------------------| ------------------------------- | ----------------------------------- |
| Display charts and dashboards                                                                              | ✅                                             | ✅                               | ✅                                  |
| Display interactive [filter widgets](https://www.metabase.com/glossary/filter_widget)                      | ✅                                             | ✅                               | ✅                                  |
| Restrict data with [locked filters](./signed-embedding-parameters.md#pre-filtering-data-in-a-signed-embed) | ❌                                             | ✅                               | ❌                                  |
| Restrict data with [sandboxes](../permissions/data-sandboxes.md)                                           | ❌                                             | ❌                               | ✅                                  |
| Drill-down using the [action menu](https://www.metabase.com/glossary/action_menu)                          | ❌                                             | ❌                               | ✅                                  |
| Self-serve via [query builder](https://www.metabase.com/glossary/query_builder)                            | ❌                                             | ❌                               | ✅                                  |

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/embedding/embedding-overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/embedding/embedding-charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
