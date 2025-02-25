---
title: Embedded analytics SDK
---

# Embedded analytics SDK

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

With the Embedded analytics SDK, you can embed individual Metabase components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

The Embedded analytics SDK is currently in beta, but you should check it out and kick the tires; you can do a lot of cool stuff with it.

## Example apps built with the embedded analytics SDK

To give you an idea of what's possible with the SDK, we've put together example sites at [metaba.se/sdk-demo](https://metaba.se/sdk-demo). Navigate between different shop websites. Check them out and poke around their products and analytics sections, as well as the New Question and New Dashboard options.

![Pug and play example app built with embedding SDK](../images/pug-and-play.png)

Here's the [Shoppy source code](https://github.com/metabase/shoppy).

## Embedded analytics SDK prerequisites

- React application. The SDK is tested to work with React 18 or higher, though it may work with earlier versions.
- [Metabase Pro or Enterprise subscription or free trial](https://www.metabase.com/pricing/).
- Metabase version 1.53 or higher.
- [Node.js 18.x LTS](https://nodejs.org/en) or higher.

## Quickstarts

- [Quickstart](./quickstart.md) (If you have Metabase and an app)
- [Quickstart CLI](./quickstart-cli.md) (If you have an app, but no Metabase)
- [Quickstart with sample React app](./quickstart-with-sample-app.md) (If you don't have either)

## Installation

To use the SDK, you'll need to enable the SDK in Metabase, and install the SDK in your React app.

### Enable the SDK in Metabase

Enable the Embedded analytics SDK by going to **Admin settings > Settings > Embedding**. Toggle on the SDK, and hit **Configure**. Enter the origins for your website or app where you want to allow SDK embedding, separated by a space. Localhost is automatically included.

### Install the SDK in your React application

You can install the Embedded analytics SDK for React via npm:

```bash
npm install @metabase/embedding-sdk-react@51-stable
```

or with yarn:

```bash
yarn add @metabase/embedding-sdk-react@51-stable
```

## Developing with the Embedded analytics SDK

Start with one of the quickstarts, then see these pages for more info on components, theming, and more.

- [Authentication](./authentication.md)
- [Questions](./questions.md)
- [Dashboards](./dashboards.md)
- [Appearance](./appearance.md)
- [Collections](./collections.md)
- [Plugins](./plugins.md)
- [Config](./config.md)
- [Versioning](./version.md)
- [Notes on Next.js](./next-js.md)

## Embedding SDK source code

You can find the [embedding SDK source code in the Metabase repo](https://github.com/metabase/metabase/tree/master/enterprise/frontend/src/embedding-sdk).

## Changelog

View the [SDK's changelog](https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/CHANGELOG.md).

## Embedded analytics SDK on NPM

Check out the Metabase Embedded analytics SDK on NPM: [metaba.se/sdk](https://metaba.se/sdk).

## SDK limitations

The SDK doesn't support:

- Verified content
- Official collections
- Subscriptions
- Alerts
- Server-side rendering (SSR).
- Multiple _interactive_ dashboards on the same application page. If you need to embed multiple dashboards on the same application page, you can embed static dashboards.

## Feedback

- Email the team at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com).
- Message the team on Slack. If you don't have a Slack channel set up, please reach out to us at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com).
