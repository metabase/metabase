---
title: Embedded analytics SDK - authentication
---

# Embedded analytics SDK - authentication

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

For using the SDK in production, you'll need to set up authentication with JWT SSO.

If you're developing locally, you can also set up authentication with [API keys](#authenticating-locally-with-api-keys).

## Setting up JWT SSO

Prerequisites:

- [A Metabase Pro or Enterprise license](https://www.metabase.com/pricing/) (If you don't have a license, check out [this quickstart](./quickstart.md))

To set up JWT SSO with Metabase and your app, you'll need to:

1. [Enable JWT SSO in your Metabase](#1-enable-jwt-sso-in-your-metabase)
2. [Add a new endpoint to your backend to handle authentication](#2-add-a-new-endpoint-to-your-backend-to-handle-authentication)
3. [Wire the SDK in your frontend to your new endpoint](#3-wire-the-sdk-in-your-frontend-to-your-new-endpoint)

### 1. Enable JWT SSO in your Metabase

1. Configure JWT by going to **Admin Settings** > **Settings** > **Authentication** and clicking on **Setup**
2. Generate a key and copy it to your clipboard.

### 2. Add a new endpoint to your backend to handle authentication

You'll need add a library to your backend to sign your JSON Web Tokens.

For Node.js, we recommend jsonwebtoken:

```
npm install jsonwebtoken --save
```

Next, set up your endpoint: this example code for Node.js sets up an endpoint in an app, `/sso/metabase`, that creates a token using the shared secret to authenticate calls to Metabase.

```js
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

// Replace this with your Metabase URL
const METABASE_INSTANCE_URL = "YOUR_METABASE_URL_HERE";
// Replace this with the JWT signing secret you generated when enabling
// JWT SSO in your Metabase.
const METABASE_JWT_SHARED_SECRET = "YOUR_SECRET_HERE";

app.get("/sso/metabase", async (req, res) => {
  // Usually, you would grab the user from the current session
  // Here it's hardcoded for demonstration purposes
  // Example:
  // const { user } = req.session;
  const user = {
    email: "rene@example.com",
    firstName: "Rene",
    lastName: "Descartes",
    group: "Customer",
  };

  if (!user) {
    console.log("no user");
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
    METABASE_JWT_SHARED_SECRET,
  );
  const ssoUrl = `${METABASE_INSTANCE_URL}/auth/sso?token=true&jwt=${token}`;
  console.log("Hitting MB SSO endpoint", ssoUrl);

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
});

const app = express();
```

### 3. Wire the SDK in your frontend to your new endpoint

Update the SDK config in your frontend code to point your backend's authentication endpoint.

```js
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "https://your-app.example.com/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});
```

(Optional) If you use headers instead of cookies to authenticate calls from your frontend to your backend, you'll need to use a [custom fetch function](#customizing-jwt-authentication).

## If your frontend and backend don't share a domain, you need to enable CORS

You can add some middleware in your backend to handle cross-domain requests.

```js
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

You can customize how the SDK fetches the refresh token by specifying the `fetchRefreshToken` function with the `defineMetabaseAuthConfig` function:

```typescript
// Pass this configuration to MetabaseProvider.
// Wrap the fetchRequestToken function in useCallback if it has dependencies to prevent re-renders.
const authConfig = defineMetabaseAuthConfig({
  fetchRequestToken: async url => {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${yourToken}` },
    });

    return await response.json();
  },
  metabaseInstanceUrl: "http://localhost:3000",
  authProviderUri: "http://localhost:9090/sso/metabase",
});
```

## Security warning: each end-user _must_ have their own Metabase account

Each end-user _must_ have their own Metabase account.

The problem with having end-users share a Metabase account is that, even if you filter data on the client side via the SDK, all end-users will still have access to the session token, which they could use to access Metabase directly via the API to get data they're not supposed to see.

If each end-user has their own Metabase account, however, you can configure permissions in Metabase and everyone will only have access to the data they should.

In addition to this, we consider shared accounts to be unfair usage. Fair usage of the SDK involves giving each end-user of the embedded analytics their own Metabase account.

## Authenticating locally with API keys

> The Embedded analytics SDK only supports JWT authentication in production. Authentication with API keys is only supported for local development and evaluation purposes.

For developing locally to try out the SDK, you can authenticate using an API key.

First, create an [API key](../../people-and-groups/api-keys.md).

Then you can then use the API key to authenticate with Metabase in your application. All you need to do is include your API key in the config object using the key: `apiKey`.

```typescript
import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com",
  apiKey: "YOUR_API_KEY",
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig} className="optional-class">
      Hello World!
    </MetabaseProvider>
  )
};
```
