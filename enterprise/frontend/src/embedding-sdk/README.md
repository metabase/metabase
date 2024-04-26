> **NOTE**: This SDK is actively being developed. We don't recommend using it in production yet!

# Metabase Embedding SDK for React

The Metabase Embedding SDK for React offers a way to integrate Metabase into your application more seamlessly and with greater flexibility than using the current interactive embedding offering based on iframes.

Features currently supported:
* embedding questions - static
* embedding questions - w/drill-down
* plugins for custom actions

Features planned:
* embedding dashboards - static
* embedding dashboards - w/ drill-down
* styling/theming via CSS
* subscribing to events

# Prerequisites

* You have an application using React 17 or higher
* You have a Pro or Enterprise [subscription or free trial](https://www.metabase.com/pricing/) of Metabase 
* You have a running Metabase instance using the enterprise binary. Currently, only master is supported until Metabase 50 is released.

# Getting started

## Start a local build of Metabase from master

1. Check out the code from the metabase repo
```git clone git@github.com:metabase/metabase.git```
1. Move into the repo and start it
```cd metabase && yarn dev-ee```
1. Metabase will be running at http://localhost:3000/
1. Go through the setup process
1. Make sure to activate your license. You can do this during the setup process or after, from the admin settings

## Configure Metabase

1. Go to Admin settings > Authentication > JWT
    1. Set JWT Identity Provider URI to your JWT endpoint
    1. Generate JWT signing key and take note of this value. You will need it later.
1. Go to Admin settings > Embedding
    1. Enable embedding if not already enabled
    1. Inside interactive embedding, set Authorized Origins to your application URL

## Authenticate users from your back-end

> **Note:** Metabase Embedding SDK for React only supports JWT authentication.**

The SDK requires an endpoint in the backend that signs a user into Metabase and returns a token that the SDK will use to make authenticated calls to Metabase.

The SDK will call this endpoint if it doesn't have a token or to refresh the token when it's about to expire.

Example:

```ts
import express from "express"
import type { Request, Response } from "express"

import jwt from "jsonwebtoken"
import fetch from "node-fetch"

async function metabaseAuthHandler(req: Request, res: Response) {
  const { user } = req.session

  if (!user) {
    return res.status(401).json({
      status: 'error',
      message: 'not authenticated',
    })
  }

  const token = jwt.sign(
    {
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      groups: [user.group],
      exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minutes expiration
    },
    // This is the JWT signing secret in your Metabase JWT authentication setting
    METABASE_JWT_SHARED_SECRET
  )
  const ssoUrl = `${METABASE_INSTANCE_URL}?token=true&jwt=${token}`

  try {
    const response = await fetch(ssoUrl, { method: 'GET' })
    const token = await response.json()

    return res.status(200).json(token)
  } catch (error) {
    if (error instanceof Error) {
      res.status(401).json({
        status: 'error',
        message: 'authentication failed',
        error: error.message,
      })
    }
  }
}

const app = express()

// middleware
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }),
)
app.use(express.json())

// routes
app.get("/sso/metabase", metabaseAuthHandler)
app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`)
})
```

## Installation

You can install Metabase Embedding SDK for react via npm:

```bash
npm install @metabase/embedding-sdk-react
```

or using yarn:

```bash
yarn add @metabase/embedding-sdk-react
```

## Using the SDK

### Initializing the SDK

Once installed, you need to import `MetabaseProvider` and provide it with a `config` object.

```jsx
import React from "react";
import { MetabaseProvider } from "@metabase/embedding-sdk-react";

// Configuration
const config = {
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL.
  jwtProviderUri: "https://app.example.com/sso/metabase", // Required: An endpoint in your app that returns signs the user in and delivers a token. We'll explain more below how to implement this endpoint.
  font: "Lato", // Optional: Specify a font to use fromt the set of fonts supported by Metabase.
}

export default function App() {
  return (
    <MetabaseProvider config={config}>
      Hello World!
    </MetabaseProvider>
  );
}
```

### Embedding a static question

After the SDK is configured, you can use embed your question using the `StaticQuestion` component.

```jsx
import React from "react";
import { MetabaseProvider, StaticQuestion} from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
  const questionId = 1; // This is the question ID you want to embed

  return (
    <MetabaseProvider config={config}>
      <StaticQuestion questionId={1} showVisualizationSelector={false} />
    </MetabaseProvider>
  );
}
```

### Embedding an interactive question (drill-down)

TODO

### Implementing custom actions

`MetabaseProvider` also supports `pluginsConfig`. You can use `pluginsConfig` to customize the SDK behavior. Currently we only allow configuring `mapQuestionClickActions` which lets you add custom actions or remove Metabase default actions in `InteractiveQuestion` component.

We'll support more plugins in next releases.

```jsx
// You can provide a custom action with your own `onClick` logic.
const createCustomAction = clicked => ({
  buttonType: "horizontal",
  name: "client-custom-action",
  section: "custom",
  type: "custom",
  icon: "chevronright",
  title: "Hello from the click app!!!",
  onClick: ({ closePopover }) => {
    alert(`Clicked ${clicked.column?.name}: ${clicked.value}`);
    closePopover();
  },
});

// Or customize the appearance of the custom action to suit your need.
const createCustomActionWithView = clicked => ({
  name: "client-custom-action-2",
  section: "custom",
  type: "custom",
  view: ({ closePopover }) => (
    <button
      className="tw-text-base tw-text-yellow-900 tw-bg-slate-400 tw-rounded-lg"
      onClick={() => {
        alert(`Clicked ${clicked.column?.name}: ${clicked.value}`);
        closePopover();
      }}
    >
      Custom element
    </button>
  ),
});

const plugins = {
  /**
   * You will have access to default `clickActions` that Metabase render by default.
   * So you could decide if you want to add custom actions, remove certain actions, etc.
   */
  mapQuestionClickActions: (clickActions, clicked) => {
    return [
      ...clickActions,
      createCustomAction(clicked),
      createCustomActionWithView(clicked),
    ]
  }
}

const questionId = 1; // This is the question ID you want to embed

return (
  <MetabaseProvider config={config} pluginsConfig={plugins}>
    <InteractiveQuestion questionId={questionId}  />
  </MetabaseProvider>
);
```

# Known limitations

The Metabase Embedding SDK only supports React on SPA Webpack applications. Applications built with Vite aren't currently supported. We aim to add support for other platforms in the near future.

# Feedback
TODO: how to share feedback with us
______

# Development

## Building locally

First you need to build the Metabase Embedding SDK for React locally:

```bash
yarn build-release:cljs
```

And then run:

```bash
yarn build-embedding-sdk:watch
```

## Using the local build

After that you need to add this built SDK package location to your package.json. In this example we assume that your application is located in the same directory as Metabase directory:

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

## Releases

Embedding SDK package build happens with Github actions if `embedding-sdk-build` label has been set on the PR.

Published package will use a version from `package.template.json` + current date and commit short hash.
