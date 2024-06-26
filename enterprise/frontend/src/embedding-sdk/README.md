> **NOTE**: This SDK is actively being developed. You can expect some changes to the API. The SDK currently only works with a specific version of Metabase.

# Metabase Embedding SDK for React

The Metabase Embedding SDK for React offers a way to integrate Metabase into your application more seamlessly and with greater flexibility than using the current interactive embedding offering based on iframes.

<div>
  <a href="https://www.loom.com/share/b6998692937c4ecaab1af097f2123c6f">
    <img style="max-width: 300px" src="https://cdn.loom.com/sessions/thumbnails/b6998692937c4ecaab1af097f2123c6f-with-play.gif">
  </a>
</div>

[Watch a 5-minute tour of the SDK's features.](https://www.loom.com/share/b6998692937c4ecaab1af097f2123c6f)

Features currently supported:

- embedding questions - static
- embedding questions - w/drill-down
- embedding dashboards - static
- embedding dashboards - w/drill-down
- embedding the collection browser
- theming with CSS variables
- plugins for custom actions

Features planned:

- subscribing to events

# Changelog
[View changelog](https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/CHANGELOG.md)

# Prerequisites

- You have an application using React 17 or higher
- You have a Pro or Enterprise [subscription or free trial](https://www.metabase.com/pricing/) of Metabase
- You have a running Metabase instance using a compatible version of the enterprise binary. v1.50.x are the only supported versions at this time.

# Getting started

## Start Metabase

Currently, the SDK only works with Metabase version 50.

You have the following options:

### 1. Running on Docker

Start the Metabase container:

```bash
docker run -d -p 3000:3000 --name metabase metabase/metabase-enterprise:v1.50.6
```

### 2. Running the Jar file

1. Download the Jar file from https://downloads.metabase.com/enterprise/v1.50.6/metabase.jar
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
   1. Inside interactive embedding, set Authorized Origins to your application URL, e.g. `http://localhost:9090`

## Authenticate users from your back-end

> **Note:** Metabase Embedding SDK for React only supports JWT authentication.

The SDK requires an endpoint in the backend that signs a user into Metabase and returns a token that the SDK will use to make authenticated calls to Metabase.

The SDK will call this endpoint if it doesn't have a token or to refresh the token when it's about to expire.

Example:

```ts
const express = require("express");

const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

async function metabaseAuthHandler(req, res) {
  const { user } = req.session;

  if (!user) {
    return res.status(401).json({
      status: "error",
      message: "not authenticated",
    });
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
    METABASE_JWT_SHARED_SECRET,
  );
  const ssoUrl = `${METABASE_INSTANCE_URL}/auth/sso?token=true&jwt=${token}`;

  try {
    const response = await fetch(ssoUrl, { method: "GET" });
    const token = await response.json();

    return res.status(200).json(token);
  } catch (error) {
    if (error instanceof Error) {
      res.status(401).json({
        status: "error",
        message: "authentication failed",
        error: error.message,
      });
    }
  }
}

const app = express();

// Middleware

// If your FE application is on a different domain from your BE, you need to enable CORS
// by setting Access-Control-Allow-Credentials to true and Access-Control-Allow-Origin
// to your FE application URL.
//
// Limitation: We currently only support setting one origin in Authorized Origins in Metabase for CORS.
app.use(
  cors({
    credentials: true,
  }),
);

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }),
);
app.use(express.json());

// routes
app.get("/sso/metabase", metabaseAuthHandler);
app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
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
};

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
  },
};

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

The component has a default height, which can be customized by using the `height` prop.
To inherit the height from the parent container, you can pass `100%` to the height prop.

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

### Embedding an interactive question (with drill-down)

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

### Embedding a static dashboard

After the SDK is configured, you can embed your dashboard using the `StaticDashboard` component.


#### Parameters

- **dashboardId**: `number` (required) – The ID of the dashboard. This is the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`
- **initialParameterValues**: `Record<string, string | string[]>` – Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.
- **withTitle**: `boolean` – Whether the dashboard should display a title.
- **withCardTitle**: `boolean` – Whether the dashboard cards should display a title.
- **withDownloads**: `boolean | null` – Whether to hide the download button.
- **hiddenParameters**: `string[] | null` – A list of parameters that will not be shown in the set of parameter filters. [More information here](https://www.metabase.com/docs/latest/questions/sharing/public-links#filter-parameters)


```jsx
import React from "react";
import { MetabaseProvider, StaticDashboard } from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
  const dashboardId = 1; // This is the dashboard ID you want to embed
  const initialParameterValues = {}; // Define your query parameters here

  // choose parameter names that are in your dashboard
  const hiddenParameters = ["location", "city"]

  return (
    <MetabaseProvider config={config}>
        <StaticDashboard
          dashboardId={dashboardId}
          initialParameterValues={initialParameterValues}
          withTitle={false}
          withDownloads={false}
          hiddenParameters={hideParameters}
        />
    </MetabaseProvider>
  );
}
```

### Embedding an interactive dashboard (with drill-down)

After the SDK is configured, you can embed your dashboard using the `InteractiveDashboard` component.


#### Parameters

- **dashboardId**: `number` (required) – The ID of the dashboard. This is the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`
- **initialParameterValues**: `Record<string, string | string[]>` – Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.
- **withTitle**: `boolean` – Whether the dashboard should display a title.
- **withCardTitle**: `boolean` – Whether the dashboard cards should display a title.
- **withDownloads**: `boolean | null` – Whether to hide the download button.
- **hiddenParameters**: `string[] | null` – A list of parameters that will not be shown in the set of parameter filters. (More information here)[https://www.metabase.com/docs/latest/questions/sharing/public-links#filter-parameters]
- **questionHeight**: `number | null` – Height of a question component when drilled from the dashboard to a question level.
- **questionPlugins** `{ mapQuestionClickActions: Function } | null` – Additional mapper function to override or add drill-down menu. [See this](#implementing-custom-actions) for more details

```jsx
import React from "react";
import { MetabaseProvider, InteractiveDashboard } from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
  const dashboardId = 1; // This is the dashboard ID you want to embed
  const initialParameterValues = {}; // Define your query parameters here

  // choose parameter names that are in your dashboard
  const hiddenParameters = ["location", "city"]

  return (
    <MetabaseProvider config={config}>
        <InteractiveDashboard
          dashboardId={dashboardId}
          initialParameterValues={initialParameterValues}
          withTitle={false}
          withDownloads={false}
          hiddenParameters={hideParameters}
        />
    </MetabaseProvider>
  );
}
```

### Embedding the collection browser

With the Collection Browser, you can browse the items in your Metabase instance from your application.

#### Parameters

- **collectionId**: `number` – The numerical ID of the collection. You can find this ID in the URL when accessing a collection in your Metabase instance. For example, the collection ID in `http://localhost:3000/collection/1-my-collection` would be `1`. If no ID is provided, the collection browser will start at the root `Our analytics` collection, which is ID = 0.
- **onClick**: `(item: CollectionItem) => void` - An optional click handler that emits the clicked entity.
- **pageSize**: `number` – The number of items to display per page. The default is 25.
- **visibleEntityTypes**: `("question" | "model" | "dashboard" | "collection")[]` – the types of entities that should be visible. If not provided, all entities will be shown.

```tsx
import React from "react";
import { CollectionBrowser } from "metabase-types/api";

export default function App() {
  const collectionId = 123; // This is the collection ID you want to browse
  const handleItemClick = (item) => {
    console.log("Clicked item:", item);
  };

  // Define the collection item types you want to be visible
  const visibleEntityTypes = ["dashboard", "question"];

  return (
    <CollectionBrowser
      collectionId={collectionId}
      onClick={handleItemClick}
      pageSize={10}
      visibleEntityTypes={visibleEntityTypes}
    />
  );
}
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

    // Default background color
    background: "#FFFFFF",

    // Slightly darker background color used for hover and accented elements
    "background-hover": "#F9FBFC",

    // Color used for borders
    border: "#EEECEC",

    // Color used for filters context
    filter: "#7172AD",

    // Color used for aggregations and breakouts context
    summarize: "#88BF4D",

    // Color used to indicate successful actions and positive values/trends
    positive: "#BADC58",

    // Color used to indicate dangerous actions and negative values/trends
    negative: "#FF7979",

    /** Color used for popover shadows */
    shadow: "rgba(0,0,0,0.08)",

    // Overrides the chart colors. Supports up to 8 colors
    // Limitation: this does not affect charts with custom series color
    charts: [
      // can either be a hex code
      "#9B59B6",

      // or a color object. tint and shade represents lighter and darker variations
      // only base color is required, while tint and shade are optional
      { base: "#E74C3C", tint: "#EE6B56", shade: "#CB4436" },
    ],
  },

  components: {
    // Dashboard
    dashboard: {
      // Background color for all dashboards
      backgroundColor: "#2F3640",

      card: {
        // Background color for all dashboard cards
        backgroundColor: "#2D2D30",

        // Apply a border color instead of shadow for dashboard cards.
        // Unset by default.
        border: "1px solid #EEECEC",
      }
    },

    // Question
    question: {
      // Background color for all questions
      backgroundColor: "#2D2D30",
    },

    // Data table
    table: {
      cell: {
        // Text color of cells, defaults to `text-primary`
        textColor: "#4C5773",

        // Default background color of cells, defaults to `background`
        backgroundColor: "#FFFFFF",

        // Font size of cell values, defaults to ~12.5px
        fontSize: "12.5px",
      },

      idColumn: {
        // Text color of ID column, defaults to `brand`
        textColor: "#9B5966",

        // Background color of ID column, defaults to a lighter shade of `brand`
        backgroundColor: "#F5E9EB",
      },
    },

    // Numerical value display
    scalar: {
      // The primary value to display
      value: {
        fontSize: "24px",
        lineHeight: "21px",
      },
    },

    // Cartesian chart
    cartesian: {
      // Padding around the cartesian charts.
      // Uses CSS's `padding` property format.
      padding: "4px 8px",
    },

    // Pivot table
    pivotTable: {
      cell: {
        // Font size of cell values, defaults to ~12px
        fontSize: "12px",
      },

      // Pivot row toggle to expand or collapse row
      rowToggle: {
        textColor: "#FFFFFF",
        backgroundColor: "#95A5A6",
      },
    },

    collectionBrowser: {
       breadcrumbs: {
         expandButton: {
           textColor: "#8118F4",
           backgroundColor: "#767D7C",
           hoverTextColor: "#CE8C8C",
           hoverBackgroundColor: "#69264B",
         },
       },
     },
  },
};
```

### Implementing custom actions

`MetabaseProvider` also supports `pluginsConfig`. You can use `pluginsConfig` to customize the behavior of components. Currently we only allow configuring `mapQuestionClickActions` which lets you add custom actions or remove Metabase default actions in `InteractiveQuestion` component.

We'll support more plugins in next releases. Please share your uses cases for us!

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
    ];
  },
};

const questionId = 1; // This is the question ID you want to embed

return (
  <MetabaseProvider config={config} pluginsConfig={plugins}>
    <InteractiveQuestion questionId={questionId} />
  </MetabaseProvider>
);
```

# Known limitations

- The Metabase Embedding SDK does not support server-side rendering (SSR) at the moment.
  - If you are using a framework with SSR support such as Next.js or Remix, you have to ensure that the SDK components are rendered on the client side.
  - For example, you can apply the `"use client"` directive on Next.js or use the `remix-utils/ClientOnly` component on Remix.

# Feedback

For issues and feedback, there are two options:

- Chat with the team directly on Slack: If you don't have access, please reach out to us at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com) and we'll get you setup.
- Email the team at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com). This will reach the development team directly.

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
