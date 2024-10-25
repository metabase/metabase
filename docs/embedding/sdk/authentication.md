---
title: Embedded analytics SDK - authentication
---

# Embedded analytics SDK - authentication

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" %}

Notes on handling authentication when working with the SDK.

## Getting Metabase authentication status

You can query the Metabase authentication status using the `useMetabaseAuthStatus` hook. This is useful if you want to completely hide Metabase components when the user is not authenticated.

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

You can customize how the SDK fetches the refresh token by specifying the `fetchRefreshToken` function in the `config` prop:

```typescript
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
