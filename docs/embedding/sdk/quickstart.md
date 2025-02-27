---
title: Embedded analytics SDK - quickstart
description: "This guide walks you through how to set up the Embedded analytics SDK in your application with your Metabase."
---

# Embedded analytics SDK - quickstart

This guide walks you through how to set up the Embedded analytics SDK in your application with your Metabase using API keys.

This setup:

- Is only for evaluation and local development (so you can see how the SDK works).
- Works on both the Enterprise and Open Source editions of Metabase, but it only works on localhost. If you want to use the SDK in production, you'll need to also [set up JWT SSO authentication](./authentication.md), which is only available in the Enterprise Edition.

## Prerequisites

- [Metabase](https://www.metabase.com/docs/latest/releases) version 52 or higher (OSS or EE). See [Installing Metabase](../../installation-and-operation/installing-metabase.md).
- An application using React 17 or 18. (You could also use the [sample React app](https://github.com/metabase/metabase-nodejs-react-sdk-embedding-sample))

If you _don't_ have a Metabase up and running, check out the [Quickstart CLI](./quickstart-cli.md).

If you _do_ have a Metabase, but _don't_ want to use your own code, check out our [quickstart with a sample app](./quickstart-with-sample-app.md).

## Overview

To embed a dashboard in your app using the SDK, you'll need to:

1. [Enable the SDK in Metabase](#1-enable-the-sdk-in-metabase)
2. [Create an API key in Metabase](#2-create-an-api-key-in-metabase)
3. [Install the SDK in your app](#3-install-the-sdk-in-your-app)
4. [Embed SDK components in your app](#4-embed-sdk-components-in-your-app)
5. [View your embedded Metabase dashboard](#5-view-your-embedded-metabase-dashboard)

## 1. Enable the SDK in Metabase

In Metabase, click on the gear icon in the upper right and navigate to **Admin Settings > Settings > Embedding** and enable the Embedded analytics SDK.

## 2. Create an API key in Metabase

Still in the Admin's Settings tab, navigate to the **Authentication** section in the sidebar and click on the **API keys** tab. [Create a new API key](../../people-and-groups/api-keys.md).

- Key name: "Embedded analytics SDK" (just to make the key easy to identify).
- Group: select “Admin” (since this is only for local testing).

## 3. Install the SDK in your app

When installing the NPM package, it's critical to use the npm dist-tag that corresponds to the major version of your Metabase. For example, if your Metabase is version 1.53.x, you'd run `53-stable`. See [SDK versioning](./version.md).

Via NPM:

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
import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  InteractiveDashboard,
} from "@metabase/embedding-sdk-react";

/**
 * This creates an auth config to pass to the `MetabaseProvider` component.
 * You'll need to replace the `metabaseInstanceUrl` and the `apiKey` values.
 */
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com",
  apiKey: "YOUR_API_KEY",
});

/**
 * Now embed your first dashboard. In this case, we're embedding the dashboard with ID 1.
 * On new Metabases, ID 1 will be the example dashboard, but feel free to use a different dashboard ID.
 */
export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <InteractiveDashboard dashboardId={1} />
    </MetabaseProvider>
  );
}
```

## 5. View your embedded Metabase dashboard

Run your app and visit the page with the embedded dashboard.

![Embedded example dashboard](../images/embedded-example-dashboard.png)

## Next steps

- Explore [theming to change the look and feel](./appearance.md).
- Continue by [setting up JWT SSO in Metabase and your app](./authentication.md) in order to sign people in, manage permissions, and deploy your app in production.
