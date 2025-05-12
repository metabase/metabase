---
title: Embedded analytics SDK - authentication
---

# Embedded analytics SDK - authentication

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

Notes on handling authentication when working with the SDK.

## Authenticating people from your server

The SDK requires an endpoint in your app's backend that will sign someone into your Metabase and return a token. The SDK will use that token to authenticate calls to Metabase.

The SDK will call this endpoint to get a new token, or to refresh an existing token that's about to expire. You'll also need [a Metabase Pro or Enterprise license](https://www.metabase.com/pricing/) (If you don't have a license, check out [this quickstart](./quickstart.md)).
To set up JWT SSO with Metabase and your app, you'll need to:

## Example code for generating a token

This example sets up an endpoint in an app, `/sso/metabase`, that creates a token using the shared secret to authenticate calls to Metabase.

```typescript
const express = require("express");
const cors = require("cors");
const session = require("express-session");
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
    const session = await response.text();

    console.log("Received session", session);
    return res.status(200).set("Content-Type", "application/json").end(session);
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

## Security warning: each end-user _must_ have their own Metabase account

Each end-user _must_ have their own Metabase account.

The problem with having end-users share a Metabase account is that, even if you filter data on the client side via the SDK, all end-users will still have access to the session token, which they could use to access Metabase directly via the API to get data they're not supposed to see.

If each end-user has their own Metabase account, however, you can configure permissions in Metabase and everyone will only have access to the data they should.

In addition to this, we consider shared accounts to be unfair usage of our terms. Fair usage of the SDK involves giving each end-user of the embedded analytics their own Metabase account.

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

## Authenticating locally with API keys

> The Embedded analytics SDK only supports JWT authentication in production. Authentication with API keys is only supported for local development and evaluation purposes.

For developing locally to try out the SDK, you can authenticate using an API key.

First, create an [API key](../../people-and-groups/api-keys.md).

Then you can then use the API key to authenticate with Metabase in your application. All you need to do is include your API key in the config object using the key: `apiKey`.

```typescript
const authConfig = {
    ...
    apiKey: "YOUR_API_KEY"
    ...
};

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig} className="optional-class">
      Hello World!
    </MetabaseProvider>
  );
```
