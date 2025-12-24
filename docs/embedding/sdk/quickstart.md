---
title: Modular embedding SDK - quickstart
description: "This guide walks you through how to set up the modular embedding SDK in your application with your Metabase."
---

# Modular embedding SDK - quickstart

This guide walks you through how to set up the Modular embedding SDK in your application with your Metabase using API keys.

This setup:

- Is only for evaluation (so you can see how the SDK works).
- Only works on localhost when developing your app (though your Metabase doesn't need to be running locally).
- Works with both the Enterprise and Open Source editions of Metabase, both self-hosted and on Metabase Cloud.

If you want to use the SDK in production, however, you'll also need to [set up JWT SSO authentication](../authentication.md), which requires a [Pro](https://store.metabase.com/checkout/embedding) or [Enterprise plan](https://www.metabase.com/pricing/). To enable JWT SSO when you're self-hosting Metabase, you'll need to run the Enterprise Edition Docker image or JAR, and [activate your license](../../installation-and-operation/activating-the-enterprise-edition.md).

## Prerequisites

- [Metabase](https://github.com/metabase/metabase/releases) version 52 or higher (OSS or EE). See [Installing Metabase](../../installation-and-operation/installing-metabase.md).
- Make sure your [React version is compatible](./introduction.md#modular-embedding-sdk-prerequisites). (You could also use the [sample React app](https://github.com/metabase/metabase-nodejs-react-sdk-embedding-sample/tree/{{page.version | remove: "v0."}}-stable).)

If you _don't_ have a Metabase up and running, check out the [Quickstart CLI](./quickstart-cli.md).

If you _don't_ want to use your own application code, check out our [quickstart with a sample app](./quickstart-with-sample-app.md).

## Overview

To embed a dashboard in your app using the SDK, you'll need to:

1. [Enable the SDK in Metabase](#1-enable-the-sdk-in-metabase)
2. [Create an API key in Metabase](#2-create-an-api-key-in-metabase)
3. [Install the SDK in your app](#3-install-the-sdk-in-your-app)
4. [Embed SDK components in your app](#4-embed-sdk-components-in-your-app)
5. [View your embedded Metabase dashboard](#5-view-your-embedded-metabase-dashboard)

## 1. Enable the SDK in Metabase

In Metabase, click on the gear icon in the upper right and navigate to **Admin Settings > Embedding > Modular** and enable the **SDK for React**.

## 2. Create an API key in Metabase

Still in the Admin console, go to **Settings > Authentication** and click on the **API keys** tab. [Create a new API key](../../people-and-groups/api-keys.md).

- Key name: "Modular embedding SDK" (just to make the key easy to identify).
- Group: select “Admin” (since this is only for local testing).

## 3. Install the SDK in your app

When installing the npm package, it's critical to use the npm dist-tag that corresponds to the major version of your Metabase. For example, if your Metabase is version 1.56.x, you'd run `56-stable`. See [SDK versioning](./version.md).

Via npm:

```
npm install @metabase/embedding-sdk-react@53-stable
```

Via Yarn:

```
yarn add @metabase/embedding-sdk-react@53-stable
```

## 4. Embed SDK components in your app

In your app, import the SDK components, like so:

```jsx
{% include_file "{{ dirname }}/snippets/quickstart/example.tsx" %}
```

## 5. View your embedded Metabase dashboard

Run your app and visit the page with the embedded dashboard.

![Embedded example dashboard](../images/embedded-example-dashboard.png)

## Next steps

- Explore [theming to change the look and feel](../appearance.md).
- Continue by [setting up JWT SSO in Metabase and your app](../authentication.md) to sign people in, manage permissions, and deploy your app in production.
