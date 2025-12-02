---
title: Embedding overview
redirect_from:
  - /docs/latest/embedding
---

# Embedding overview

## [Introduction](./introduction.md)

What is embedding, and how does it work?

## [Embedded analytics SDK](./sdk/introduction.md)

With the Embedded analytics SDK, you can embed individual Metabase components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

## [Embedded analytics JS](./embedded-analytics-js.md)

Embed dashboards, questions, or the query builder in your app with JavaScript (no React required). Built on the Embedded analytics SDK with per-component controls and theming. Integrate your app's auth with Metabase SSO.

## [Embedded analytics SDK quickstart](./sdk/quickstart.md)

Jump to a SDK quickstart with a sample React application.

## [Static embedding](./static-embedding.md)

Also known as Signed Embedding, Static embedding is a secure way to embed charts and dashboards. Static embeds are view only; people won't be able to drill-through charts and tables.

## [Parameters for static embeds](./static-embedding-parameters.md)

You can pass parameters between Metabase and your website via the embedding URL to specify how Metabase items should look and behave inside the iframe on your website.

## [Interactive embedding](./interactive-embedding.md)

Interactive embedding allows you to embed full Metabase app in an iframe. Interactive embedding integrates with your data permissions to let people slice and dice data on their own using Metabase's query builder.

## [Interactive embedding quickstart](./interactive-embedding-quick-start-guide.md)

You'll embed the full Metabase application in your app. Once logged in, people can view a Metabase dashboard in your web app, and be able to use the full Metabase application to explore their data, and only their data.

## [Interactive UI components](./interactive-ui-components.md)

Customize the UI components in your interactive embed by adding parameters to the embedding URL.

## [Public embeds](./public-links.md)

Admins can also create unsecured public links or embeds of questions and dashboards.

## [Securing embedded Metabase](./securing-embeds.md)

How to make sure the right people can see the right data in your embedded Metabase.

## [Translating questions and dashboards](./translations.md)

Upload a translation dictionary to translate questions and dashboards (only in static embeds).
