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
{% include_file "{{ dirname }}/snippets/authentication/express-server.ts" %}
```

### 3. Wire the SDK in your frontend to your new endpoint

Update the SDK config in your frontend code to point your backend's authentication endpoint.

```js
{% include_file "{{ dirname }}/snippets/authentication/auth-config-base.tsx" snippet="example" %}
```

(Optional) If you use headers instead of cookies to authenticate calls from your frontend to your backend, you'll need to use a [custom fetch function](#customizing-jwt-authentication).

## If your frontend and backend don't share a domain, you need to enable CORS

You can add some middleware in your backend to handle cross-domain requests.

```js
{% include_file "{{ dirname }}/snippets/authentication/express-server-cors.ts" snippet="example" %}
```

## Getting Metabase authentication status

You can query the Metabase authentication status using the `useMetabaseAuthStatus` hook. This is useful if you want to completely hide Metabase components when the user is not authenticated.

This hook can only be used within components wrapped by `MetabaseProvider`.

```jsx
{% include_file "{{ dirname }}/snippets/authentication/get-auth-status.tsx" snippet="example" %}
```

## Customizing JWT authentication

You can customize how the SDK fetches the refresh token by specifying the `fetchRefreshToken` function with the `defineMetabaseAuthConfig` function:

```typescript
{% include_file "{{ dirname }}/snippets/authentication/auth-config-jwt.tsx" snippet="example" %}
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
{% include_file "{{ dirname }}/snippets/authentication/auth-config-api-key.tsx" %}
```
