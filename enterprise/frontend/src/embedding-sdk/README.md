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
* You have a running Metabase instance using a compatible version of the enterprise binary. For now, we supply specific compatible versions as Jar files and Docker images. Note these are not considered stable.

# Getting started

## Start Metabase

Currently, the SDK only works with specific versions of Metabase.
You have the following options:

### 1. Running on Docker
Start the Metabase container:
```bash
docker run -d -p 3000:3000 --name metabase metabase/metabase-dev:embedding-sdk-0.1.0
```

### 2. Running the Jar file
1. Download the Jar file from http://downloads.metabase.com/sdk/v0.1.0/metabase.jar
2. Create a new directory and move the Metabase JAR into it.
3. Change into your new Metabase directory and run the JAR.
```bash
java -jar metabase.jar
```

## Configure Metabase

1. Go to Admin settings > Authentication > JWT
    1. Set JWT Identity Provider URI to your JWT endpoint
    1. Generate JWT signing key and take note of this value. You will need it later.
1. Go to Admin settings > Embedding
    1. Enable embedding if not already enabled
    1. Inside interactive embedding, set Authorized Origins to your application URL

## Authenticate users from your back-end

> **Note:** Metabase Embedding SDK for React only supports JWT authentication.

The SDK requires an endpoint in the backend that signs a user into Metabase and returns a token that the SDK will use to make authenticated calls to Metabase.

The SDK will call this endpoint if it doesn't have a token or to refresh the token when it's about to expire.

Example:

```ts
const express = require("express")

const jwt = require("jsonwebtoken")
const fetch = require("node-fetch")

async function metabaseAuthHandler(req, res) {
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
  const ssoUrl = `${METABASE_INSTANCE_URL}/auth/sso?token=true&jwt=${token}`

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

// Middleware

// If your FE application is on a different domain from your BE, you need to enable CORS
// by setting Access-Control-Allow-Credentials to true and Access-Control-Allow-Origin
// to your FE application URL.
app.use(cors({
  credentials: true,
}))

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

You can install Metabase Embedding SDK for React via npm:

```bash
npm install @metabase/embedding-sdk-react --force
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
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  jwtProviderUri: "https://app.example.com/sso/metabase", // Required: An endpoint in your app that returns signs the user in and delivers a token
}

// See the "Customizing appearance" section for more information
const theme = {
  // Optional: Specify a font to use from the set of fonts supported by Metabase
  fontFamily: "Lato",

  // Optional: Match your application's color scheme
  colors: {
    brand: "#9B5966",
    "text-primary": "#4C5773",
    "text-secondary": "#696E7B",
    "text-tertiary": "#949AAB",
  }
}

export default function App() {
  return (
    <MetabaseProvider config={config} theme={theme}>
      Hello World!
    </MetabaseProvider>
  );
}
```

### Embedding a static question

After the SDK is configured, you can use embed your question using the `StaticQuestion` component.

You can optionally pass in `height` to change the height of the component.

```jsx
import React from "react";
import { MetabaseProvider, StaticQuestion } from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
  const questionId = 1; // This is the question ID you want to embed

  return (
    <MetabaseProvider config={config}>
        <StaticQuestion questionId={questionId} showVisualizationSelector={false} />
    </MetabaseProvider>
  );
}
```

### Embedding an interactive question (drill-down)

```jsx
import React from "react";
import { MetabaseProvider, InteractiveQuestion } from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
  const questionId = 1; // This is the question ID you want to embed

  return (
    <MetabaseProvider config={config}>
      <InteractiveQuestion questionId={questionId}  />
    </MetabaseProvider>
  );
}
const questionId = 1; // This is the question ID you want to embed

```

### Customizing appearance

You can provide a theme object to the `MetabaseProvider` to customize the look and feel of embedded Metabase components.

Here is the full list of theme properties supported. All of them are optional.

```ts
const theme = {
  // Specify a font to use from the set of fonts supported by Metabase.
  // You can set the font to "Custom" to use the custom font
  // configured in your Metabase instance.
  fontFamily: "Lato",

  // Override the base font size for every component.
  // This does not usually need to be set, as the components
  // inherit the font size from the parent container, such as the body.
  fontSize: "16px",

  // Override the base line height for every component.
  lineHeight: 1.5,

  // Match your application's color scheme
  colors: {
    // The primary color of your application
    brand: "#9B5966",

    // The color of text that is most prominent
    "text-primary": "#4C5773",

    // The color of text that is less prominent
    "text-secondary": "#696E7B",

    // The color of text that is least prominent
    "text-tertiary": "#949AAB",

    /** Default background color. */
    background: "#FFFFFF",

    /** Slightly darker background color used for hover and accented elements. */
    "background-hover": "#F9FBFC",

    /** Color used for borders */
    border: "#EEECEC",

    /** Color used for filters context */
    filter: "#7172AD",

    /** Color used for aggregations and breakouts context */
    summarize: "#88BF4D",

    /** Color used for popover shadows */
    shadow: "rgba(0,0,0,0.08)",
  },

  table: {
    cell: {
      // Text color of cells, defaults to `text-dark`
      textColor: "#4C5773",

      // Default background color of cells, defaults to `bg-white`
      backgroundColor: "#FFFFFF",
    },

    idColumn: {
      // Text color of ID column, defaults to `brand`
      textColor: "#9B5966",

      // Background color of ID column, defaults to a lighter shade of `brand`
      backgroundColor: "#F5E9EB",
    },
  },
}
```

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

### Reloading Metabase components

In case you need to reload a Metabase component, for example, your users modify your application data and that data is used to render a question in Metabase. If you embed this question and want to force Metabase to reload the question to show the latest data, you can do so by using the `key` prop to force a component to reload.

```jsx
// Inside your application component
const [data, setData] = useState({});
// This is used to force reloading Metabase components
const [counter, setCounter] = useState(0);

// This ensures we only change the `data` reference when it's actually changed
const handleDataChange = (newData) => {
  setData(prevData => {
    if (isEqual(prevData, newData)) {
      return prevData;
    }

    return newData
  });
};

useEffect(() => {
  /**
   * When you set `data` as the `useEffect` hook's dependency, it will trigger the effect
   * and increment the counter which is used in a Metabase component's `key` prop, forcing it to reload.
   */
  if (data) {
    setCounter(counter => counter + 1);
  }
}, [data])

return <InteractiveQuestion key={counter} questionId={yourQuestionId} />
```

# Known limitations

The Metabase Embedding SDK only supports React on SPA Webpack applications. Applications built with Vite aren't currently supported. We aim to add support for other platforms in the near future.

# Feedback
For issues and feedback, there are two options:

* Chat with the team directly on Slack: If you don't have access, please reach out to us at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com) and we'll get you setup.
* Email the team at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com). This will reach the development team directly.

For security issues, please follow the instructions for responsible disclosure [here](https://github.com/metabase/metabase/blob/master/SECURITY.md#reporting-a-vulnerability).

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
