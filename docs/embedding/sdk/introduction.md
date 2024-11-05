---
title: Embedded analytics SDK
---

# Embedded analytics SDK

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

With the Embedded analytics SDK, you can embed individual Metabase components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

The Embedded analytics SDK is currently in beta, but you should check it out and kick the tires; you can do a lot of cool stuff with it.

## Example apps built with the embedded analytics SDK

To give you and idea of what's possible with the SDK, we've put together example sites at [metaba.se/sdk-demo](https://metaba.se/sdk-demo). Navigate between three different shop websites: The Stitch, Luminara Beauty, and Pug & Play. Check them out and poke around their products and analytics sections, as well as the New Question and New Dashboard options.

![Pug and play example app built with embedding SDK](../images/pug-and-play.png)

## Embedded analytics SDK prerequisites

- React application. The SDK is tested to work with React 18 or higher, though it may work with earlier versions.
- [Metabase Pro or Enterprise subscription or free trial](https://www.metabase.com/pricing/).
- Metabase version 1.51 or higher.
- [Node.js 18.x LTS](https://nodejs.org/en) or higher.

## Embedded analytics SDK on NPM

Check out the Metabase Embedded analytics SDK on NPM: [metaba.se/sdk](https://metaba.se/sdk).

## Quickstart with CLI

If you have Node and Docker installed, you can change into your React application and run:

```sh
npx @metabase/embedding-sdk-react@latest start
```

Only works locally, and you don't need a license key (but you can use one to demo more features).

See more about the [CLI quickstart](./quickstart-cli.md).

We also have a [quickstart with a sample app that uses JWT](./quickstart.md).

## Installation

You'll need to enable the SDK in your Metabase, and install the SDK as a dependency in your app.

### In Metabase

Enable the Embedded analytics SDK by going to **Admin settings > Settings > Embedding**. Toggle on the SDK, and hit **Configure**. Enter the origins for your website or app where you want to allow SDK embedding, separated by a space. Localhost is automatically included.

### In your React application

You can install the Embedded analytics SDK for React via npm:

```bash
npm install @metabase/embedding-sdk-react@51-stable
```

or with yarn:

```bash
yarn add @metabase/embedding-sdk-react@51-stable
```

## Developing with the embedded analytics SDK

- [Quickstart with sample app and JWT](./quickstart.md)
- [Quickstart with CLI and your data](./quickstart-cli.md)
- [Questions](./questions.md)
- [Dashboards](./dashboards.md)
- [Collections](./collections.md)
- [Appearance](./appearance.md)
- [Plugins](./plugins.md)
- [Versioning](./version.md)
- [Authentication](./authentication.md)
- [Config](./config.md)
- [Notes on Next.js](./next-js.md)

## Embedding SDK source code

You can find the [embedding SDK source code in the Metabase repo](https://github.com/metabase/metabase/tree/master/enterprise/frontend/src/embedding-sdk).

## Changelog

[View changelog](https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/CHANGELOG.md)

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
