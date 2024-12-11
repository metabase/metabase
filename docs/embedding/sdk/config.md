---
title: Embedded analytics SDK - config
---

# Embedded analytics SDK - config

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

To use the SDK in your app, you need to import the `MetabaseProvider` component and provide it with an `authConfig` object, like so:

```typescript
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "https://app.example.com/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig} theme={theme} className="optional-class">
      Hello World!
    </MetabaseProvider>
  );
}
```

You can also pass additional props to `MetabaseProvider`:

- `authConfig` (Required). Defines how to authenticate with Metabase.
- `theme` (Optional) See [Appearance](./appearance.md).
- `pluginsConfig` (Optional). See [Plugins](./plugins.md).
- `eventHandlers` (Optional). See [Global event handlers](#global-event-handlers).
- `className` (Optional). Classes to be added to the wrapper element.
- `locale` (Optional). Defines the display language. Accepts an ISO language code such as `en` or `de`.
- `loaderComponent` (Optional). A custom loader component to display while the SDK is loading.
- `errorComponent` (Optional). A custom error component to display when the SDK encounters an error.
- `allowConsoleLog` (Optional). If `true`, log messages will be printed to the console.

## Example `config` object passed to `MetabaseProvider`

```typescript
import React from "react";
import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  defineMetabaseTheme,
} from "@metabase/embedding-sdk-react";

// Configure authentication
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "https://app.example.com/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});

// See the "Customizing appearance" section for more information
const theme = defineMetabaseTheme({
  // Optional: Specify a font to use from the set of fonts supported by Metabase
  fontFamily: "Lato",

  // Optional: Match your application's color scheme
  colors: {
    brand: "#9B5966",
    "text-primary": "#4C5773",
    "text-secondary": "#696E7B",
    "text-tertiary": "#949AAB",
  },
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig} theme={theme} className="optional-class">
      Hello World!
    </MetabaseProvider>
  );
}
```

## Global event handlers

`MetabaseProvider` also supports `eventHandlers`.

Currently, we support:

- `onDashboardLoad?: (dashboard: Dashboard | null) => void;`. Triggers when a dashboard loads with all visible cards and their content
- `onDashboardLoadWithoutCards?: (dashboard: Dashboard | null) => void;`. Triggers after a dashboard loads, but without its cards (at this stage only the dashboard title, tabs, and cards grid are rendered, but the contents of the cards have yet to load.

```typescript
const handleDashboardLoad: SdkDashboardLoadEvent = dashboard => {
  /* do whatever you need to do - e.g. send analytics events, show notifications */
};

const eventHandlers = {
  onDashboardLoad: handleDashboardLoad,
  onDashboardLoadWithoutCards: handleDashboardLoad,
};

return (
  <MetabaseProvider authConfig={authConfig} eventHandlers={eventHandlers}>
    {children}
  </MetabaseProvider>
);
```

## Reloading Metabase components

In case you need to reload a Metabase component, for example, your users modify your application data and that data is used to render a question in Metabase. If you embed this question and want to force Metabase to reload the question to show the latest data, you can do so by using the `key` prop to force a component to reload.

```typescript
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
