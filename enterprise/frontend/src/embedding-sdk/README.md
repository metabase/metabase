> **NOTE**: This SDK is actively being developed. You can expect some changes to the API. The SDK currently only works
> with a specific version of Metabase.

# Metabase Embedding SDK for React

The Metabase Embedding SDK for React offers a way to integrate Metabase into your application more seamlessly and with
greater flexibility than using the current interactive embedding offering based on iframes.

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
- ability for the user to modify existing questions
- theming with CSS variables
- plugins for custom actions, overriding dashboard card menu items
- subscribing to events

Features not yet supported:

- letting users create new questions from scratch
- creating and editing dashboards

# Changelog

[View changelog](https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/CHANGELOG.md)

# Prerequisites

- You have an application using React. The SDK is tested to work with React 18. It may work in React 17, but cause some
  warnings or unexpected behaviors.
- You have a Pro or Enterprise [subscription or free trial](https://www.metabase.com/pricing/) of Metabase
- You have a running Metabase instance using a compatible version of the enterprise binary. v1.50.x are the only
  supported versions at this time.

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

## Configuring Metabase

> **Note**: The Metabase Embedding SDK for React only supports JWT authentication in production. API keys are only
> supported for development and evaluation purposes.

### API Keys

> **Note:** Metabase Embedding SDK only supports API keys for development.
> This is only supported for evaluation purposes, has limited feature coverage and will only work on localhost.

1. Go to Admin settings > Authentication > API keys
2. Click `Create API Key` and give the key a name and group
3. Copy the API key.

You can then use the API key to authenticate with Metabase in your application. Here's an example of how you can
authenticate with the API key:

```
const metabaseConfig = {
    ...
    apiKey: "YOUR_API_KEY"
    ...
};
```

### JWT Authentication

1. Go to Admin settings > Authentication > JWT
    1. Set JWT Identity Provider URI to your JWT endpoint
    1. Generate JWT signing key and take note of this value. You will need it later.
1. Go to Admin settings > Embedding
    1. Enable embedding if not already enabled
    1. Inside interactive embedding, set Authorized Origins to your application URL, e.g. `http://localhost:9090`

## Authenticate users from your back-end

The SDK requires an endpoint in the backend that signs a user into Metabase and returns a token that the SDK will use to
make authenticated calls to Metabase.

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
npm install @metabase/embedding-sdk-react
```

or using yarn:

```bash
yarn add @metabase/embedding-sdk-react
```

## Using the SDK

### Initializing the SDK

Once installed, you need to import `MetabaseProvider` and provide it with a `config` object.

```typescript jsx
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

```typescript jsx
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

You can pass parameter values to questions defined with SQL via `parameterValues` prop,
in the format of `{parameter_name: parameter_value}`. Refer to
the [SQL parameters](https://www.metabase.com/docs/v0.50/questions/native-editor/sql-parameters.html)
documentation for more information.

```jsx
<StaticQuestion questionId={questionId} parameterValues={{product_id: 50}} />
```

### Embedding an interactive question (with drill-down)

```typescript jsx
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

#### _Customizing Interactive Questions_

By default, the Metabase Embedding SDK provides a default layout for interactive questions that allows you to view your
questions, apply filters and aggregations, and access functionality within the notebook editor. However, we also know
that there's no such thing as a one-size-fits-all when it comes to style, usage, and all of the other variables that
make your application unique. Therefore, we've added the ability to customize the layout of interactive questions.

Using the `InteractiveQuestion` with its default layout looks like this:

```typescript jsx
<InteractiveQuestion questionId={95} />
```

To customize the layout, use namespaced components within the `InteractiveQuestion`. For example:

```typescript jsx
<InteractiveQuestion questionId={95}>
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div style={{ display: "grid", placeItems: "center" }}>
      <InteractiveQuestion.Title />
      <InteractiveQuestion.ResetButton />
    </div>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "100%" }}>
        <InteractiveQuestion.QuestionVisualization />
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "scroll" }}>
        <InteractiveQuestion.Summarize />
      </div>
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}>
      <InteractiveQuestion.Filter />
    </div>
  </div>
</InteractiveQuestion>
```

#### _Available Components_

These components are available via the `InteractiveQuestion` namespace (i.e. `<InteractiveQuestion.ComponentName />`)

| Component               | Info                                                                                                                         |
|-------------------------|------------------------------------------------------------------------------------------------------------------------------|
| `BackButton`            | The back button, which provides `back` functionality for the InteractiveDashboard                                            |
| `FilterBar`             | The row of badges that contains the current filters that are applied to the question                                         |
| `Filter`                | The Filter pane containing all possible filters                                                                              |
| `FilterButton`          | The button used in the default layout to open the Filter pane. You can replace this button with your own implementation.     |
| `ResetButton`           | The button used to reset the question after the question has been modified with filters/aggregations/etc                     |
| `Title`                 | The question's title                                                                                                         |
| `Summarize`             | The Summarize pane containing all possible aggregations                                                                      |
| `SummarizeButton`       | The button used in the default layout to open the Summarize pane. You can replace this button with your own implementation.  |
| `Notebook`              | The Notebook editor that allows for more filter, aggregation, and custom steps                                               |
| `NotebookButton`        | The button used in the default layout to open the Notebook editor. You can replace this button with your own implementation. |
| `QuestionVisualization` | The chart visualization for the question                                                                                     |

### Embedding a static dashboard

After the SDK is configured, you can embed your dashboard using the `StaticDashboard` component.

#### Parameters

- **dashboardId**: `number` (required) – The ID of the dashboard. This is the numerical ID when accessing a dashboard
  link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`
- **initialParameterValues**: `Record<string, string | string[]>` – Query parameters for the dashboard. For a single
  option, use a `string` value, and use a list of strings for multiple options.
- **withTitle**: `boolean` – Whether the dashboard should display a title.
- **withCardTitle**: `boolean` – Whether the dashboard cards should display a title.
- **withDownloads**: `boolean | null` – Whether to hide the download button.
- **hiddenParameters**: `string[] | null` – A list of parameters that will not be shown in the set of parameter
  filters. [More information here](https://www.metabase.com/docs/latest/questions/sharing/public-links#filter-parameters)
- **onLoad**: `(dashboard: Dashboard | null) => void;` - event handler that triggers after dashboard loads with all
  visible cards and their content.
- **onLoadWithoutCards**: `(dashboard: Dashboard | null) => void;` - event handler that triggers after dashboard loads,
  but without its cards - at this stage dashboard title, tabs and cards grid is rendered, but cards content is not yet
  loaded.

```typescript jsx
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

- **dashboardId**: `number` (required) – The ID of the dashboard. This is the numerical ID when accessing a dashboard
  link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`
- **initialParameterValues**: `Record<string, string | string[]>` – Query parameters for the dashboard. For a single
  option, use a `string` value, and use a list of strings for multiple options.
- **withTitle**: `boolean` – Whether the dashboard should display a title.
- **withCardTitle**: `boolean` – Whether the dashboard cards should display a title.
- **withDownloads**: `boolean | null` – Whether to hide the download button.
- **hiddenParameters**: `string[] | null` – A list of parameters that will not be shown in the set of parameter
  filters. (More information
  here)[https://www.metabase.com/docs/latest/questions/sharing/public-links#filter-parameters]
- **questionHeight**: `number | null` – Height of a question component when drilled from the dashboard to a question
  level.
- **questionPlugins** `{ mapQuestionClickActions: Function } | null` – Additional mapper function to override or add
  drill-down menu. [See this](#implementing-custom-actions) for more details
- **onLoad**: `(dashboard: Dashboard | null) => void;` - event handler that triggers after dashboard loads with all
  visible cards and their content.
- **onLoadWithoutCards**: `(dashboard: Dashboard | null) => void;` - event handler that triggers after dashboard loads,
  but without its cards - at this stage dashboard title, tabs and cards grid is rendered, but cards content is not yet
  loaded.

```typescript jsx
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

- **collectionId**: `number` – The numerical ID of the collection. You can find this ID in the URL when accessing a
  collection in your Metabase instance. For example, the collection ID
  in `http://localhost:3000/collection/1-my-collection` would be `1`. If no ID is provided, the collection browser will
  start at the root `Our analytics` collection, which is ID = 0.
- **onClick**: `(item: CollectionItem) => void` - An optional click handler that emits the clicked entity.
- **pageSize**: `number` – The number of items to display per page. The default is 25.
- **visibleEntityTypes**: `("question" | "model" | "dashboard" | "collection")[]` – the types of entities that should be
  visible. If not provided, all entities will be shown.

```tsx
import React from "react";
import { CollectionBrowser } from "metabase-types/api";

export default function App() {
  const collectionId = 123; // This is the collection ID you want to browse
  const handleItemClick = item => {
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
      },
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

    // Number chart
    number: {
      // Value displayed on number charts.
      // This also applies to the primary value in trend charts.
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

    // Popover are used in components such as click actions in interactive questions.
    popover: {
      // z-index of the popover. Useful for embedding components in a modal. defaults to 4.
      zIndex: 4,
    },
  },
};
```

### Plugins

The Metabase Embedding SDK supports plugins to customize the behavior of components. These plugins can be used in a
global context or on a per-component basis. This list of plugins will continue to grow as we add more options to each
component.

To use a plugin globally, add the plugin to the `MetabaseProvider`'s `pluginsConfig` prop:

```typescript jsx
<MetabaseProvider
  config={config}
  theme={theme}
  pluginsConfig={{
    mapQuestionClickActions: [...] // Add your custom actions here
  }}
>
  {children}
</MetabaseProvider>
```

To use a plugin on a per-component basis, pass the plugin as a prop to the component:

```typescript jsx
<InteractiveQuestion
  questionId={1}
  plugins={{
    mapQuestionClickActions: [...],
  }}
/>
```

#### _Interactive Question_

###### `mapQuestionClickActions`

This plugin allows you to add custom actions to
the click-through menu of an interactive question. You can add and
customize the appearance and behavior of the custom actions.

```typescript jsx
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

#### _Interactive Dashboard_

###### `dashcardMenu`

This plugin allows you to add, remove, and modify the custom actions on the overflow menu of dashboard cards. The plugin
appears as a dropdown menu on the top right corner of the card.

The plugin's default configuration looks like this:

```typescript jsx
const plugins = {
  dashboard: {
    dashcardMenu: {
      withDownloads: true,
      withEditLink: true,
      customItems: [],
    },
  },
}
```

and can be used in the InteractiveDashboard like this:

```typescript jsx
<InteractiveDashboard
  questionId={1}
  plugins={{
    dashboard: {
      dashcardMenu: null,
    },
  }}
/>
```

Take a look below to see how you can customize the plugin:

###### Enabling/disabling default actions

To remove the download button from the dashcard menu, set `withDownloads` to `false`. To remove the edit link from the
dashcard menu, set `withEditLink` to `false`.

```typescript jsx
const plugins = {
  dashboard: {
    dashcardMenu: {
       withDownloads: false,
       withEditLink: false,
       customItems: [],
    }
  }
};
```

###### Adding custom actions to the existing menu:

You can add custom actions to the dashcard menu by adding an object to the `customItems` array. Each element can either
be an object or a function that takes in the dashcard's question, and outputs a list of custom items in the form of:

```typescript jsx
{
  iconName: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}
```

```typescript jsx
const plugins: SdkPluginsConfig = {
  dashboard: {
    dashcardMenu: {
      customItems: [
        {
          iconName: "chevronright",
          label: "Custom action",
          onClick: () => {
            alert(`Custom action clicked`);
          },
        },
        ({ question }) => {
          return {
            iconName: "chevronright",
            label: "Custom action",
            onClick: () => {
              alert(`Custom action clicked ${question.name}`);
            },
          };
        },
      ],
    },
  },
};
```

###### Replacing the existing menu with your own component

If you want to replace the existing menu with your own component, you can do so by providing a function that returns a
React component. This function also can receive the question as an argument.

```typescript jsx
const plugins: SdkPluginsConfig = {
  dashboard: {
    dashcardMenu: ({ question }) => (
      <button onClick={() => console.log(question.name)}>Click me</button>
    ),
  },
};
```

### Adding global event handlers

`MetabaseProvider` also supports `eventHandlers` configuration. This way you can add global handlers to react on events
that happen in the SDK context.

Currently, we support:

- `onDashboardLoad?: (dashboard: Dashboard | null) => void;` - triggers when dashboard loads with all visible cards and
  their content
- `onDashboardLoadWithoutCards?: (dashboard: Dashboard | null) => void;` - triggers after dashboard loads, but without
  its cards - at this stage dashboard title, tabs and cards grid is rendered, but cards content is not yet loaded

```typescript jsx
const handleDashboardLoad: SdkDashboardLoadEvent = dashboard => {
  /* do whatever you need to do - e.g. send analytics events, show notifications */
};

const eventHandlers = {
  onDashboardLoad: handleDashboardLoad,
  onDashboardLoadWithoutCards: handleDashboardLoad,
};

return (
  <MetabaseProvider config={config} eventHandlers={eventHandlers}>
    {children}
  </MetabaseProvider>
);
```

### Getting Metabase authentication status

You can query the Metabase authentication status using the `useMetabaseAuthStatus` hook.
This is useful if you want to completely hide Metabase components when the user is not authenticated.

This hook can only be used within components wrapped by `MetabaseProvider`.

```jsx
const auth = useMetabaseAuthStatus()

if (auth.status === "error") {
  return <div>Failed to authenticate: {auth.error.message}</div>
}

if (auth.status === "success") {
  return <InteractiveQuestion questionId={110} />;
}
```

### Reloading Metabase components

In case you need to reload a Metabase component, for example, your users modify your application data and that data is
used to render a question in Metabase. If you embed this question and want to force Metabase to reload the question to
show the latest data, you can do so by using the `key` prop to force a component to reload.

```typescript jsx
// Inside your application component
const [data, setData] = useState({});
// This is used to force reloading Metabase components
const [counter, setCounter] = useState(0);

// This ensures we only change the `data` reference when it's actually changed
const handleDataChange = newData => {
  setData(prevData => {
    if (isEqual(prevData, newData)) {
      return prevData;
    }

    return newData;
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
}, [data]);

return <InteractiveQuestion key={counter} questionId={yourQuestionId} />;
```

### Customizing JWT authentication

You can customize how the SDK fetches the refresh token by specifying the `fetchRefreshToken` function in the `config`
prop:

```typescript jsx
/**
  * This is the default implementation used in the SDK.
  * You can customize this function to fit your needs, such as adding headers or excluding cookies.

  * The function must return a JWT token object, or return "null" if the user is not authenticated.

  * @returns {Promise<{id: string, exp: number} | null>}
 */
async function fetchRefreshToken(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  return await response.json();
}

// Pass this configuration to MetabaseProvider.
// Wrap the fetchRequestToken function in useCallback if it has dependencies to prevent re-renders.
const config = { fetchRefreshToken };
```

# Known limitations

- The Metabase Embedding SDK does not support server-side rendering (SSR) at the moment.
    - If you are using a framework with SSR support such as Next.js or Remix, you have to ensure that the SDK components
      are rendered on the client side.
    - For example, you can apply the `"use client"` directive on Next.js or use the `remix-utils/ClientOnly` component
      on Remix.
- Embedding multiple instances of interactive dashboards on the same page are not supported.
    - Please use static dashboards if you need to embed multiple dashboards on the same page.

# Feedback

For issues and feedback, there are two options:

- Chat with the team directly on Slack: If you don't have access, please reach out to us
  at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com) and we'll get you setup.
- Email the team at [sdk-feedback@metabase.com](mailto:sdk-feedback@metabase.com). This will reach the development team
  directly.

For security issues, please follow the instructions for responsible
disclosure [here](https://github.com/metabase/metabase/blob/master/SECURITY.md#reporting-a-vulnerability).

# Development

## Storybook

You can use storybook to run SDK components during local development.

When you have Metabase instance running:
```bash
yarn storybook-embedding-sdk
```


### Initial configuration
1. Set JWT secret to be "`0000000000000000000000000000000000000000000000000000000000000000`" in Admin > Authentication > JWT > String used by the JWT signing key
1. Make sure "User Provisioning" setting is set to "`on`".
1. Set Authorized Origins to "`*`" in Admin > Embedding > Interactive embedding


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

## Releases

Embedding SDK package build happens with Github actions if `embedding-sdk-build` label has been set on the PR.

Published package will use a version from `package.template.json` + current date and commit short hash.
