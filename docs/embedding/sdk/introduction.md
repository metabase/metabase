---
title: Embedded analytics SDK
---

# Embedded analytics SDK (BETA)

{% include plans-blockquote.html feature="Embedding SDK" %}

> The Metabase embedding SDK is currently in beta, but you should check it out and kick the tires; you can do a lot of [cool stuff with it](#example-apps-built-with-the-embedding-sdk).

With the [Embedding SDK](./embedding-sdk-introduction.md), you can embed individual Metabase components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

## Example apps built with the embedded analytics SDK

To give you and idea of what's possible with the SDK, we've put together example sites at [metaba.se/sdk-demo](https://metaba.se/sdk-demo). Navigate between three different shop websites: The Stitch, Luminara Beauty, and Pug & Play. Check them out and poke around their products and analytics sections, as well as the New Question and New Dashboard options.

![Pug and play example app built with embedding SDK](../images/pug-and-play.png)

# Embedding SDK prerequisites

- React application. The SDK is tested to work with React 18 or higher, though it may work with earlier versions.
- [Metabase Pro or Enterprise subscription or free trial](https://www.metabase.com/pricing/).
- Metabase version 1.50 or higher.
- [Node.js 18.x LTS](https://nodejs.org/en) or higher.

## Embedding SDK on NPM

Check out the [Metabase embedding SDK on NPM: [metaba.se/sdk](https://metaba.se/sdk).

## Installation

### In Metabase

Enable the Embedded Analytics SDK by going to **Admin settings > Settings > Embedding**. Toggle on, and hit **Configure**. Enter the origins for your website or app where you want to allow SDK embedding, separated by a space. Localhost is automatically included.

### In your React application

You can install the Embedded Analytics SDK for React via npm:

```bash
npm install @metabase/embedding-sdk-react
```

or with yarn:

```bash
yarn add @metabase/embedding-sdk-react
```

## Development

### Storybook

You can use storybook to run SDK components during local development.

When you have Metabase instance running:

```bash
yarn storybook-embedding-sdk
```

### Initial configuration

1. Set JWT secret to be "`0000000000000000000000000000000000000000000000000000000000000000`" in Admin > Authentication > JWT > String used by the JWT signing key.
2. Enable the Embedded Analytics SDK in Admin settings > Settings > Embedding. Enter the origins for your website or app where you want to allow SDK embedding, separated by a space.
3. Make sure "User Provisioning" setting is set to "`on`".
4. Set Authorized Origins to "`*`" in Admin > Embedding > Interactive embedding.

### Building locally

First you need to build the Metabase Embedding SDK for React locally:

```bash
yarn build-release:cljs
```

And then run:

```bash
yarn build-embedding-sdk:watch
```

### Using the local build

After that you need to add this built SDK package location to your package.json. In this example we assume that your
application is located in the same directory as Metabase directory:

```json
"dependencies": {
"@metabase/embedding-sdk-react": "file:../metabase/resources/embedding-sdk"
}
```

And then you can install the package using npm or yarn:

```bash
npm install
# or
yarn
```

## Embedding SDK source code

You can find the [embedding SDK source code in the Metabase repo](https://github.com/metabase/metabase/tree/master/enterprise/frontend/src/embedding-sdk).

## SDK limitations

- Unsupported features:
  - Verified content
  - Official collections
  - Subscriptions
  - Alerts
- The Metabase Embedding SDK does not support server-side rendering (SSR) at the moment.
- Multiple embedded dashboards on the same application page. If you need to embed multiple dashboards on the same application page, you can embed static dashboards.

## Feedback

- Email the team at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com).
- Message the team on Slack. If you don't have a Slack channel set up, please reach out to us at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com).
