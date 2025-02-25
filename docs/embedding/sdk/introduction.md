---
title: Embedded analytics SDK
---

# Embedded analytics SDK

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

With the Embedded analytics SDK, you can embed individual Metabase components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

## Example apps built with the embedded analytics SDK

To give you and idea of what's possible with the SDK, we've put together example sites at [metaba.se/sdk-demo](https://metaba.se/sdk-demo). Navigate between the different shop websites: Proficiency Labs, The Stitch, Luminara Beauty, and Pug & Play. Check them out and poke around their products and [analytics sections](https://embedded-analytics-sdk-demo.metabase.com/admin/analytics/17), as well as the New Question and New Dashboard options.

![Pug and play example app built with embedding SDK](../images/pug-and-play.png)

To see how we made the demo, check out the [SDK demo's source code](https://github.com/metabase/shoppy).

## Embedded analytics SDK prerequisites

- React application. The SDK is tested to work with React 18 or higher, though it may work with earlier versions.
- [Metabase Pro or Enterprise subscription or free trial](https://www.metabase.com/pricing/).
- Metabase version 1.52 or higher.
- [Node.js 20.x LTS](https://nodejs.org/en).

## Embedded analytics SDK on NPM

Check out the Metabase Embedded analytics SDK on NPM: [https://www.npmjs.com/package/@metabase/embedding-sdk-react](https://www.npmjs.com/package/@metabase/embedding-sdk-react).

## Quickstart with CLI

If you have Node and Docker installed, you can change into your React application and run:

```sh
npx @metabase/embedding-sdk-react@latest start
```

This CLI quickstart only works locally, and you don't need a license key (but you can use one to demo more features).

## Quickstarts

- [Quickstart](./quickstart.md) (If you have Metabase and an app)
- [Quickstart CLI](./quickstart-cli.md) (If you have an app, but no Metabase)
- [Quickstart with sample React app](./quickstart-with-sample-app.md) (If you don't have either)

## Installation

To use the SDK, you'll need to enable the SDK in Metabase, and install the SDK in your React app.

### Enable the SDK in Metabase

Enable the Embedded analytics SDK:

1. Go to **Admin settings > Settings > Embedding**.
2. Toggle on the SDK.
3. Hit **Configure**.
4. Enter the origins for your website or app where you want to allow SDK embedding, separated by a space. Localhost is automatically included.

### Install the SDK in your React application

You can install the Embedded analytics SDK for React via npm:

```bash
npm install @metabase/embedding-sdk-react@53-stable
```

or with yarn:

```bash
yarn add @metabase/embedding-sdk-react@53-stable
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
- Multiple _interactive_ dashboards on the _same_ application page. If you need to embed multiple dashboards on the same application page, you can embed static dashboards.

## Feedback

- Email the team at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com).
- Message the team on Slack. If you don't have a Slack channel set up, please reach out to us at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com).
