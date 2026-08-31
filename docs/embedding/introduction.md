---
title: Embedding introduction
summary: Different ways you can embed charts and dashboards, or all of Metabase, in your app.
redirect_from:
  - /docs/latest/administration-guide/13-embedding
---

# Embedding introduction

You can embed Metabase tables, charts, dashboards, AI chat---even Metabase's query builder---in your website or application.

There are two ways to embed Metabase.

- **[Modular embedding](#modular-embedding)**: embed individual Metabase components, like questions, dashboards, and AI chat, so they seamlessly integrate with your app.
- **[Full app embedding](#full-app-embedding)**: embed the full Metabase app in an iframe, styled like your branding.

Most people go with modular embedding, so you can integrate Metabase components into your app.

Whichever way you embed, you'll also pick how Metabase authenticates the people looking at it. Authentication is a setting on what you embed, not a different kind of embedding.

If you just want to share a chart or dashboard with anyone who has the link, and you don't need any authentication, take a look at [public links and embeds](#public-links-and-embeds).

## Modular embedding

With [modular embedding](./modular-embedding.md), you can embed individual Metabase [components](./components.md) in your web app: dashboards, questions, the query builder, AI chat, and a collection browser.

When you setting up an embed, you need to pick an authentication method:

- **Metabase account (SSO)**, for [components with SSO authentication](#components-with-sso-authentication)
- **Guest**, for [components with guest authentication](#components-with-guest-authentication)

The authentication method you choose determines what people can do (see the comparison below).

You can only use one authentication method per page of your app. A single page can't mix a question that uses SSO with a question that uses guest authentication.

## Comparison between SSO and guest authentication

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
| [AI chat](./ai-chat.md)                                                                   | ✅  | ❌    |
| [Collection browser](./browser.md)                                                        | ✅  | ❌    |
| Advanced [Tenant](./tenants.md) and [permissions](../permissions/embedding.md) management | ✅  | ❌    |
| [Advanced theming](./appearance.md)                                                       | ✅  | ❌    |
| [Custom visualizations](./custom-visualizations.md)                                       | ✅  | ❌    |
| [Usage analytics](../usage-and-performance-tools/usage-analytics.md)                      | ✅  | ❌    |
| Customize layouts and behavior with [plugins](./sdk/plugins.md)                           | ✅  | ❌    |
| [Locked filters](./guest-embedding.md#locked-parameters)\*\*\*                            | ❌  | ✅    |

\* Each authentication method allows data downloads by default, but only [Pro and Enterprise](https://www.metabase.com/pricing/) plans can disable data downloads.

\*\* Requires a [Pro and Enterprise](https://www.metabase.com/pricing/) plan with either authentication method.

\*\*\* Components that use SSO don't need locked filters. Since Metabase knows who's viewing, you can segregate data with [permissions](../permissions/embedding.md) instead. There's a little more set up, but much less long-term overhead.

### Components with SSO authentication

With SSO, Metabase can know who's viewing what, which unlocks a lot of stuff. You can automatically apply [data permissions](../permissions/embedding.md), which means you can give people access to all the cool tools Metabase provides, and everyone will only ever see the data they're allowed to.

**When to use SSO**: You want to offer multi-tenant, self-service analytics, or you want to include the query builder, AI chat, drill-through, or a collection browser.

SSO requires a Pro or Enterprise plan, and everyone viewing the embedded component needs their own Metabase account. To set up JWT or SAML, check out [modular embedding authentication](./authentication.md).

If you're building a SaaS product with embedded analytics for multiple customers, you can keep customer data isolated with [Tenants](./tenants.md).

Accounts for these embedded people in your Metabase count toward the [accounts billed in your Metabase plan](https://www.metabase.com/how-billing-works). But by letting your customers self-serve their data, you save time on developing bespoke charts. And you can charge _more_ for a premium analytics experience. If you plan on giving a lot of your customers self-service access to their data, you should consider an enterprise plan, with custom pricing that scales with your business.

### Components with guest authentication

With [guest authentication](./guest-embedding.md), Metabase doesn't create a session for the person viewing the component, so you don't have to create a Metabase account for everyone who sees your charts and dashboards. Guest authentication works on all Metabase plans, including OSS and Starter.

Guest doesn't mean unsecured. Metabase only loads the component if the request carries a JWT signed with a secret shared between your app and your Metabase. What Metabase doesn't have is an identity: with no account to check permissions against, Metabase can't tell whether a new query is one that person should be allowed to run. That's why components with guest authentication are view-only.

**When to use guest**: embedding charts and dashboards where you don't want to offer ad-hoc querying or chart drill-through. To filter data down to what's relevant to the person viewing, use [locked parameters](./guest-embedding.md#locked-parameters), where your app sets the filter value in the signed token.

## Set up modular embeds with web components or React

Whichever way you authenticate, you can set up modular embeds two ways.

- **Web components**: a script tag plus HTML elements like `<metabase-question>`. Web components have no build step and no framework requirement, so they work in plain HTML, Vue, Svelte, Rails, React, or any framework you like. Metabase's [in-app wizard](./modular-embedding.md) writes the code for you.
- **React SDK**: React components that you import and compose yourself. The [SDK](./sdk/introduction.md) gives you more control: you can build custom layouts and [customize behavior with plugins](./sdk/plugins.md).

If your app runs on React and you want that extra control, go with the SDK. Otherwise start with web components. You can always move to the SDK later.

## Full app embedding

[Full app embedding](./full-app-embedding.md) allows you to embed the entire Metabase app in an iframe, and integrate Metabase SSO with your app's authentication.

## Public links and embeds

If you'd like to share your data with the good people of the internet, admins can create a [public link](./public-links.md) or embed a question or dashboard directly in your website. A public link is a URL you can hand to anyone. A public embed is an iframe snippet you drop into one of your pages. Neither one is really an embedding setup — there's no authentication, and anyone with the link can see the data.

**When to use public links and embeds**: one-off charts and dashboards. Admins can use public links when you just need to show someone a chart or dashboard without giving people access to your Metabase. And you don't care who sees the data; you want to make the item available to everyone.

## Resources for AI agents

If you're using an AI agent to help you embed Metabase in your app, check out [AI agent resources](./ai-agent-resources.md).

## Tracking embed usage

{% include plans-blockquote.html feature="Tracking embed usage" %}

[Usage Analytics](../usage-and-performance-tools/usage-analytics.md) tracks embed usage, including embedding context, authentication methods, hostname, and other metadata. Check out the [Embedding usage dashboard](../usage-and-performance-tools/usage-analytics-reference.md#embedding-usage).

For information about the anonymous usage data Metabase collects from embedded components, see [Embedding telemetry](../installation-and-operation/information-collection.md#embedding-telemetry).

## Embedding limitations

- Currently, you can't embed [documents](../documents/introduction.md) (though you can create [public documents](./public-links.md)).
- [Modular embeds](./modular-embedding.md) that use SSO can render [custom visualizations](../questions/visualizations/custom.md), but only the custom visualizations you add to your [allowlist](./custom-visualizations.md). Components that use guest authentication fall back to the default visualization.

## Further reading

- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/metabase-basics/embedding/overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/metabase-basics/embedding/charts-and-dashboards).
- [Multi-tenant self-service analytics](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
- [Securing embedded Metabase](./securing-embeds.md).
