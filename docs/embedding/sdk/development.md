---
title: "Embedded analytics SDK - development
---

# Embedded analytics SDK - development

Some docs on developing embedding analytics with the SDK.

## Initial configuration

1. Set JWT secret to be "`0000000000000000000000000000000000000000000000000000000000000000`" in Admin > Authentication > JWT > String used by the JWT signing key.
2. Enable the Embedded Analytics SDK in Admin settings > Settings > Embedding. Enter the origins for your website or app where you want to allow SDK embedding, separated by a space.
3. Make sure "User Provisioning" setting is set to "`on`".
4. Set Authorized Origins to "`*`" in Admin > Embedding > Interactive embedding.

## Building locally

Build the Metabase Embedding SDK for React locally:

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

## Storybook

You can use storybook to run SDK components during local development.

When you have Metabase running:

```bash
yarn storybook-embedding-sdk
```



## Getting Metabase authentication status

You can query the Metabase authentication status using the `useMetabaseAuthStatus` hook.
This is useful if you want to completely hide Metabase components when the user is not authenticated.

This hook can only be used within components wrapped by `MetabaseProvider`.

```jsx
const auth = useMetabaseAuthStatus();

if (auth.status === "error") {
  return <div>Failed to authenticate: {auth.error.message}</div>;
}

if (auth.status === "success") {
  return <InteractiveQuestion questionId={110} />;
}
```

## Customizing JWT authentication

You can customize how the SDK fetches the refresh token by specifying the `fetchRefreshToken` function in the `config`
prop:

```typescript jsx
/**
 * This is the default implementation used in the SDK.
 * You can customize this function to fit your needs, such as adding headers or excluding cookies.

 * The function must return a JWT token object, or return "null" if the user is not authenticated.

 * @returns {Promise<{id: string, exp: number} | null>}
 */
async function fetchRequestToken(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  return await response.json();
}

// Pass this configuration to MetabaseProvider.
// Wrap the fetchRequestToken function in useCallback if it has dependencies to prevent re-renders.
const config = { fetchRequestToken };
```

## Reloading Metabase components

In case you need to reload a Metabase component, for example, your users modify your application data and that data is used to render a question in Metabase. If you embed this question and want to force Metabase to reload the question to
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

## Global event handlers

`MetabaseProvider` also supports `eventHandlers`.

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
