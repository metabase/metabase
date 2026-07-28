---
title: Embedding introduction
summary: Different ways you can embed charts and dashboards, or all of Metabase, in your app.
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Embedding introduction

You can embed Metabase tables, charts, dashboards, AI chat—even Metabase's query builder—in your website or application.

There are two ways to embed Metabase.

- [Modular embedding](#modular-embedding). Embed individual Metabase components like questions, dashboards, AI chat so they seamlessly integrate with your app.
- [Full-app embedding](#full-app-embedding). Embed the full Metabase app in an iframe, styled like your branding.

Most people go with modular embedding, so they can integrate Metabase components with your app.

## Modular embedding

There are two ways to embed Metabase components:

- Web components
- React SDK

Which to use: if your app uses React, use the React SDK. Otherwise, use the web components. The web components are built on top of the React SDK, so either option works for a React app—the SDK just gives you more control.

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

| Action                                     | SSO | Guest |
| ------------------------------------------ | --- | ----- |
| Charts                                     | ✅  | ✅    |
| Dashboards                                 | ✅  | ✅    |
| Filter widgets                             | ✅  | ✅    |
| Export results\*                           | ✅  | ✅    |
| Basic appearance customization\*\*         | ✅  | ✅    |
| Row-level data segregation                 | ✅  | ✅    |
| Advanced Tenant and permissions management | ✅  | ❌    |
| Drill-through menus                        | ✅  | ❌    |
| Query builder                              | ✅  | ❌    |
| SQL editor                                 | ✅  | ❌    |
| AI chat                                    | ✅  | ❌    |
| Collection browser                         | ✅  | ❌    |
| Advanced theming                           | ✅  | ❌    |
| Usage analytics                            | ✅  | ❌    |
| Customize behavior with plugins            | ✅  | ❌    |

\* Each embedding type allows data downloads by default, but only [Pro and Enterprise](https://www.metabase.com/pricing/) plans can disable data downloads.

\*\* Requires a [Pro and Enterprise](https://www.metabase.com/pricing/) plan for any embedding type.

### Should you use the Modular embedding SDK?

If your app uses React, you can go with the modular embedding SDK, but you don't need to.

The modular embeds that you can set up in the [in-app wizard](./modular-embedding.md) are built on top of the Modular embedding SDK. Using the SDK just gives you slightly more customization (see the table above), but your app has to use React. You can always start with modular embedding, then move to the SDK if you really need that extra customization. Both support SSO and Guest embeds.

## Resources for AI agents

If you're using an AI agent to help you embed Metabase in your app, check out [AI agent resources](./ai-agent-resources.md).

## Tracking embed usage

{% include plans-blockquote.html feature="Tracking embed usage" %}

[Usage Analytics](../usage-and-performance-tools/usage-analytics.md) tracks embed usage, including embedding context, authentication methods, hostname, and other metadata. Check out the [Embedding usage dashboard](../usage-and-performance-tools/usage-analytics-reference.md#embedding-usage).

For information about the anonymous usage data Metabase collects from embedded components, see [Embedding telemetry](../installation-and-operation/information-collection.md#embedding-telemetry).

## Embedding limitations

- Currently, you can't embed [documents](../documents/introduction.md) (though you can create [public documents](./public-links.md)).

## Full app embedding

[Full app embedding](./full-app-embedding.md) allows you to embed the entire Metabase app in an iframe, and integrate Metabase SSO with your app's authentication.

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/metabase-basics/embedding/overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/metabase-basics/embedding/charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
- [Securing embedded Metabase](./securing-embeds.md).
