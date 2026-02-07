---
title: Modular embedding SDK
redirect_from:
  - /docs/latest/embedding/sdk
---

# Modular embedding SDK

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

With the modular embedding SDK, you can embed individual Metabase components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

## Example apps built with the modular embedding SDK

To give you an idea of what's possible with the SDK, we've put together example sites at [metaba.se/sdk-demo](https://metaba.se/sdk-demo). Navigate between different shop websites. Check them out and poke around their products and analytics sections, as well as the New Question and New Dashboard options.

![Pug and play example app built with modular embedding SDK](../images/pug-and-play.png)

Here's the [Shoppy source code](https://github.com/metabase/shoppy).

## Modular embedding SDK prerequisites

- React application using React 18 or React 19.
- Nodejs 20.x or higher.
- Metabase version 1.52 or higher.

## Quickstarts

The best way to get started with Modular embedding SDK depends on what you already have:

- You have an app and a Metabase instance: go to [main quickstart](./quickstart.md)
- You have an app but no Metabase: go to [quickstart with CLI](./quickstart-cli.md)
- You don't have an app: go to [quickstart with a sample React app](./quickstart-with-sample-app.md)

## Installation

To use the SDK, you'll need to enable the SDK in Metabase, and install the SDK in your React app.

### Enable the SDK in Metabase

1. Enable the Modular embedding SDK by going to **Admin settings > Embedding**.
2. Toggle on **Modular embedding SDK**.
3. In **Cross-Origin Resource Sharing (CORS)**, enter the origins for your website or app where you want to allow SDK embedding, separated by a space. Localhost is automatically included.

### Install the SDK in your React application

You can install the modular embedding SDK for React via npm. Make sure to use the dist-tag that corresponds to your Metabase version, example: 56-stable for Metabase 56:

```bash
npm install @metabase/embedding-sdk-react@56-stable
```

or with Yarn:

```bash
yarn add @metabase/embedding-sdk-react@56-stable
```

### Resolving `@types/react` version mismatches

In rare scenarios, the modular embedding SDK and your application may use different major versions of `@types/react`, causing TypeScript conflicts.

To enforce a single `@types/react` version across all dependencies, add an `overrides` (npm) or `resolutions` (Yarn) section to your `package.json` and specify the `@types/react` version your application uses.

#### npm set @types/react version

```json
{
  "overrides": {
    "@types/react": "..."
  }
}
```

#### Yarn set @types/react version

```json
{
  "resolutions": {
    "@types/react": "..."
  }
}
```

## Architecture

Starting with Metabase 57, the SDK consists of two parts:

- **SDK Package** – The `@metabase/embedding-sdk-react` npm package is a lightweight bootstrapper library. Its primary purpose is to load and run the main SDK Bundle code.
- **SDK Bundle** – The full SDK code, served directly from your self-hosted Metabase instance or Metabase Cloud, and it's the part of the Metabase. This ensures that the main SDK code is always compatible with its corresponding Metabase instance.

## Developing with the modular embedding SDK

Start with one of the quickstarts, then see these pages for more info on components, theming, and more.

- [Authentication](../authentication.md)
- [Questions](./questions.md)
- [AI chat](./ai-chat.md)
- [Dashboards](./dashboards.md)
- [Appearance](../appearance.md)
- [Collections](./collections.md)
- [Plugins](./plugins.md)
- [Config](./config.md)
- [Versioning](./version.md)
- [Notes on Next.js](./next-js.md)

## Modular embedding SDK source code

You can find the [Modular embedding SDK source code in the Metabase repo](https://github.com/metabase/metabase/tree/master/enterprise/frontend/src/embedding-sdk).

## Modular embedding SDK on npm

Check out the Metabase Modular embedding SDK on npm: [metaba.se/sdk-npm](https://metaba.se/sdk-npm).

## SDK limitations

The SDK doesn't support:

- Verified content
- Official collections
- Subscriptions
- Alerts
- Dashboard custom destinations (instead, use [display as link](./plugins.md#handlelink)
- Dashboard link cards
- Server-side rendering (SSR)

Other limitations:

- Multiple _interactive_ dashboards on the same application page. If you need to embed multiple dashboards on the same application page, you can embed static dashboards.
- If you have Leaflet 1.x as a dependency in your app, you may run into compatibility issues. You can try using Leaflet 2.x instead.

## Issues, feature requests and support

[Bugs](https://github.com/metabase/metabase/issues/?q=is%3Aissue%20state%3Aopen%20label%3AType%3ABug%20label%3AEmbedding%2FSDK) and [feature requests](https://github.com/metabase/metabase/issues/?q=is%3Aissue%20state%3Aopen%20label%3AEmbedding%2FSDK%20label%3A%22Type%3ANew%20Feature%22) are tracked on GitHub.

You can upvote an existing feature request by leaving a thumbs up emoji reaction on the issue. Feel free to leave comments with context that could be useful. [Read more](https://www.metabase.com/docs/latest/troubleshooting-guide/requesting-new-features).

Before creating new issues, please make sure an issue for your problem or feature request doesn't already exist.
To seek help:

- Paid customers can contact our success team through the usual channels.
- People using the open-source edition can post on our [discussion forums](https://discourse.metabase.com/).
