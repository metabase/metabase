---
title: Embedding overview
redirect_from:
  - /docs/latest/embedding
---

# Embedding overview

## [Introduction](./introduction.md)

What is embedding, and how does it work?

## [Modular embedding](./modular-embedding.md)

Embed individual dashboards, questions, or the query builder in your app with an interactive wizard and simple drop-in script, with minimal or no coding required. Control component UI and theming. Integrate your app's auth with Metabase SSO.

If you're on Metabase OSS or Starter, you can only embed components without SSO. See [Guest embeds](./guest-embedding.md).

### [Modular embedding SDK](./sdk/introduction.md)

With the Modular embedding SDK, you can embed individual Metabase components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

### [Modular embedding SDK quickstart](./sdk/quickstart.md)

Jump to a SDK quickstart with a sample React application.

### [Guest embedding](./guest-embedding.md)

Guest embedding is a secure way to embed charts and dashboards. Guest embeds are view-only; people won't be able to drill-through charts and tables.

### [Translating guest embeds](./translations.md)

Upload a translation dictionary to translate questions and dashboards (only in guest embeds).

## [Full app embedding](./full-app-embedding.md)

Full app embedding allows you to embed full Metabase app in an iframe. Full app embedding integrates with your data permissions to let people slice and dice data on their own using Metabase's query builder.

### [Full app embedding quickstart](./full-app-embedding-quick-start-guide.md)

You'll embed the full Metabase application in your app. Once logged in, people can view a Metabase dashboard in your web app, and be able to use the full Metabase application to explore their data, and only their data.

### [Full app UI components](./full-app-ui-components.md)

Customize the UI components in your full app embed by adding parameters to the embedding URL.

## [Public embeds](./public-links.md)

Admins can also create unsecured public links or embeds of questions and dashboards.

## [Securing embeds](./securing-embeds.md)

How to make sure the right people can see the right data in your embedded Metabase.
