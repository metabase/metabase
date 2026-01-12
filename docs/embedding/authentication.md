---
title: Modular embedding - authentication
summary: Adding SSO with JWT or SAML for authenticating modular embeds.
redirect_from:
  - /docs/latest/embedding/sdk/authentication
---

# Modular embedding - authentication

{% include plans-blockquote.html feature="Authenticated embeds" sdk=true is_plural=true%}

For using modular embedding with SSO in production, you'll need to set up authentication.

If you're developing locally, you can also set up authentication with [API keys](#authenticating-locally-with-api-keys).

You can set up SSO with JWT or SAML.

## Setting up JWT SSO

To set up JWT SSO, you'll need [a Metabase Pro or Enterprise license](https://www.metabase.com/pricing/).

Here's a high-level overview:

1. [Enable JWT SSO in your Metabase](#1-enable-jwt-sso-in-your-metabase)
2. [Add a new endpoint to your backend to handle authentication](#2-add-a-new-endpoint-to-your-backend-to-handle-authentication)
3. [Wire your frontend to your new endpoint](#3-wire-your-frontend-to-your-new-endpoint)

### 1. Enable JWT SSO in your Metabase

1. Configure JWT by going to **Admin Settings** > **Settings** > **Authentication** and clicking on **Setup**
2. Enter the JWT Identity Provider URI, for example `http://localhost:9090/sso/metabase`. This is a new endpoint you will add in your backend to handle authentication.
3. Generate a key and copy it to your clipboard.

### 2. Add a new endpoint to your backend to handle authentication

You'll need to add a library to your backend to sign your JSON Web Tokens.

For Node.js, we recommend jsonwebtoken:

```
npm install jsonwebtoken --save
```

Next, set up an endpoint on your backend (e.g., `/sso/metabase`) that uses your Metabase JWT shared secret to generate a JWT for the authenticated user. **This endpoint must return a JSON object with a `jwt` property containing the signed JWT.** For example: `{ "jwt": "your-signed-jwt" }`.

This example code for Node.js sets up an endpoint using Express:

```js
{% include_file "{{ dirname }}/sdk/snippets/authentication/express-server.ts" %}
```

Example using Next.js App Router:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/next-js/app-router-authentication-api-route.ts" %}
```

Example using Next.js Pages Router:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/next-js/pages-router-authentication-api-route.ts" %}
```

#### Handling full app and SDK embeds with the same endpoint

If you have an existing backend endpoint configured for full app embedding and want to use the same endpoint for SDK embedding, you can differentiate between the requests by checking for the `response=json` query parameter that the SDK adds to its requests.

- For SDK requests, you should return a JSON object with the JWT (`{ jwt: string }`).
- For full app embedding requests, you would proceed with the redirect.

Here's an example of an Express.js endpoint that handles both:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/authentication/express-server-interactive-and-sdk.ts" %}
```

### 3. Wire your frontend to your new endpoint

Update the config in your frontend code to point to your backend's authentication endpoint.

```js
{% include_file "{{ dirname }}/sdk/snippets/authentication/auth-config-base.tsx" snippet="example" %}
```

(Optional) If you use headers instead of cookies to authenticate calls from your frontend to your backend, you'll need to use a [custom fetch function](#customizing-jwt-authentication).

## If your frontend and backend don't share a domain, you need to enable CORS

You can add some middleware in your backend to handle cross-domain requests.

```js
{% include_file "{{ dirname }}/sdk/snippets/authentication/express-server-cors.ts" snippet="example" %}
```

## Customizing JWT authentication

You can customize how the SDK fetches the request token by specifying the `fetchRequestToken` function with the `defineMetabaseAuthConfig` function:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/authentication/auth-config-jwt.tsx" snippet="example" %}
```

The response should be in the form of `{ jwt: "{JWT_TOKEN}" }`

## Setting up SAML SSO

{% include plans-blockquote.html feature="SAML authentication" sdk=true %}

To use SAML single sign-on with modular embedding, you'll need to set up SAML in both your Metabase and your Identity Provider (IdP). See the docs on [SAML-based authentication](../people-and-groups/authenticating-with-saml.md).

Once SAML is configured in Metabase and your IdP, you can configure the SDK to use SAML by setting the `preferredAuthMethod` in your `MetabaseAuthConfig` to `"saml"`:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/authentication/auth-config-saml.tsx" snippet="example" %}
```

Using SAML authentication with modular embedding will typically involve redirecting people to a popup with your Identity Provider's login page for authentication. After successful authentication, the person will be redirected back to the embedded content.

Due to the nature of redirects and popups involved in the SAML flow, SAML authentication may not work seamlessly in all embedding contexts, particularly within iframes, depending on browser security policies and your IdP's configuration. We recommend testing auth flows in your target environments.

Unlike JWT authentication, you won't be able to implement a custom `fetchRequestToken` function on your backend when pairing SAML with modular embedding.

## If both SAML and JWT are enabled, modular embedding will default to SAML

You can override this default behavior to prefer the JWT authentication method by setting `preferredAuthMethod="jwt"` in your authentication config:

```typescript
authConfig: {
  metabaseInstanceUrl: "...",
  preferredAuthMethod: "jwt",
  // other JWT config...
}
```

## Getting Metabase authentication status

You can query the Metabase authentication status using the `useMetabaseAuthStatus` hook. This is useful if you want to completely hide Metabase components when the user is not authenticated.

This hook can only be used within components wrapped by `MetabaseProvider`.

```jsx
{% include_file "{{ dirname }}/sdk/snippets/authentication/get-auth-status.tsx" snippet="example" %}
```

## Authenticating locally with API keys

> Modular embedding only supports JWT authentication in production. Authentication with API keys is only supported for local development and evaluation purposes.

For developing locally to try out modular embedding, you can authenticate using an API key.

First, create an [API key](../people-and-groups/api-keys.md).

Then you can then use the API key to authenticate with Metabase in your application. All you need to do is include your API key in the config object using the key: `apiKey`.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/authentication/auth-config-api-key.tsx" %}
```

## Security warning: each end-user _must_ have their own Metabase account

Each end-user _must_ have their own Metabase account.

The problem with having end-users share a Metabase account is that, even if you filter data on the client side via modular embedding, all end-users will still have access to the session token, which they could use to access Metabase directly via the API to get data they're not supposed to see.

If each end-user has their own Metabase account, however, you can configure permissions in Metabase and everyone will only have access to the data they should.

In addition to this, we consider shared accounts to be unfair usage. Fair usage of modular embedding involves giving each end-user of the embedded analytics their own Metabase account.

## Upgrade guide for JWT SSO setups on SDK version 54 or below

If you're upgrading from an SDK version 1.54.x or below and you're using JWT SSO, you'll need to make the following changes.

**Frontend changes**:

- [Remove `authProviderUri` from all `defineMetabaseAuthConfig` calls](#remove-authprovideruri-from-your-auth-config)
- **If using custom `fetchRequestToken`:** [Update function signature and hardcode authentication endpoint URLs](#update-the-fetchrequesttoken-function-signature)

**Backend changes**:

- [Update backend endpoint to return `{ jwt: "token" }` JSON response for SDK requests](#update-your-jwt-endpoint-to-handle-sdk-requests).

Additionally, if you have SAML set up, but you'd prefer to use JWT SSO, you'll need to set a [preferred authentication method](#if-both-saml-and-jwt-are-enabled-modular-embedding-will-default-to-saml).

### Remove `authProviderUri` from your auth config

`defineMetabaseAuthConfig` no longer accepts an `authProviderUri` parameter, so you'll need to remove it.

**Admin setting changes in Metabase**:

In **Admin Settings** > **Authentication** > **JWT SSO**, set the `JWT Identity Provider URI` to the URL of your JWT SSO endpoint, e.g., `http://localhost:9090/sso/metabase`.

**Before:**

```jsx
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
  authProviderUri: "http://localhost:9090/sso/metabase", // Remove this line
});
```

**After:**

```jsx
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});
```

The SDK now uses the JWT Identity Provider URI setting configured in your Metabase admin settings (Admin > Settings > Authentication > JWT).

### Update the `fetchRequestToken` function signature

The `fetchRequestToken` function no longer receives a URL parameter. You must now specify your authentication endpoint directly in the function.

**Before:**

```jsx
const authConfig = defineMetabaseAuthConfig({
  fetchRequestToken: async (url) => {
    // Remove url parameter
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${yourToken}` },
    });
    return await response.json();
  },
  metabaseInstanceUrl: "http://localhost:3000",
  authProviderUri: "http://localhost:9090/sso/metabase", // Remove this line
});
```

**After:**

```jsx
const authConfig = defineMetabaseAuthConfig({
  fetchRequestToken: async () => {
    // No parameters
    const response = await fetch("http://localhost:9090/sso/metabase", {
      // Hardcode your endpoint URL
      method: "GET",
      headers: { Authorization: `Bearer ${yourToken}` },
    });
    return await response.json();
  },
  metabaseInstanceUrl: "http://localhost:3000",
});
```

### Update your JWT endpoint to handle SDK requests

Your JWT endpoint must now handle both SDK requests and full app embedding requests. The SDK adds a `response=json` query parameter to distinguish its requests. For SDK requests, return a JSON object with the JWT. For full app embedding, continue redirecting as before.

If you were using a custom `fetchRequestToken`, you'll need to update the endpoint to detect `req.query.response === "json"` for SDK requests.

```jsx
app.get("/sso/metabase", async (req, res) => {
  // SDK requests include 'response=json' query parameter
  const isSdkRequest = req.query.response === "json";

  const user = getCurrentUser(req);

  const token = jwt.sign(
    {
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      groups: [user.group],
      exp: Math.round(Date.now() / 1000) + 60 * 10,
    },
    METABASE_JWT_SHARED_SECRET,
  );

  if (isSdkRequest) {
    // For SDK requests, return JSON object with jwt property
    res.status(200).json({ jwt: token });
  } else {
    // For full app embedding, redirect as before
    const ssoUrl = `${METABASE_INSTANCE_URL}/auth/sso?token=true&jwt=${token}`;
    res.redirect(ssoUrl);
  }
});
```
