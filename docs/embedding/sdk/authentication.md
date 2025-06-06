---
title: Embedded analytics SDK - authentication
---

# Embedded analytics SDK - authentication

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

For using the SDK in production, you'll need to set up authentication with JWT SSO.

If you're developing locally, you can also set up authentication with [API keys](#authenticating-locally-with-api-keys).

If both SAML and JWT are enabled in your Metabase, the SDK will default to using SAML authentication unless you explicitly set the `preferredAuthMethod` to `"jwt"` in your `MetabaseAuthConfig`:

```javascript
authConfig: {
  metabaseInstanceUrl: "...",
  preferredAuthMethod: "jwt",
  // other JWT config...
}
```

For details on SAML authentication with the SDK, see [Authenticating with SAML SSO](#authenticating-with-saml-sso).

## Setting up JWT SSO

Prerequisites:

- [A Metabase Pro or Enterprise license](https://www.metabase.com/pricing/) (If you don't have a license, check out [this quickstart](./quickstart.md))

To set up JWT SSO with Metabase and your app, you'll need to:

1. [Enable JWT SSO in your Metabase](#1-enable-jwt-sso-in-your-metabase)
2. [Add a new endpoint to your backend to handle authentication](#2-add-a-new-endpoint-to-your-backend-to-handle-authentication)
3. [Wire the SDK in your frontend to your new endpoint](#3-wire-the-sdk-in-your-frontend-to-your-new-endpoint)

### 1. Enable JWT SSO in your Metabase

1. Configure JWT by going to **Admin Settings** > **Settings** > **Authentication** and clicking on **Setup**
2. Generate a key and copy it to your clipboard.

### 2. Add a new endpoint to your backend to handle authentication

You'll need add a library to your backend to sign your JSON Web Tokens.

For Node.js, we recommend jsonwebtoken:

```
npm install jsonwebtoken --save
```

Next, set up an endpoint on your backend (e.g., `/sso/metabase`) that uses your Metabase JWT shared secret to generate a JWT for the authenticated user. **This endpoint must return a JSON object with a `jwt` property containing the signed JWT.** For example: `{ "jwt": "your-signed-jwt" }`.

This example code for Node.js sets up an endpoint using Express:

```js
{% include_file "{{ dirname }}/snippets/authentication/express-server.ts" %}
```

Example using Next.js App Router:

```typescript
{% include_file "{{ dirname }}/snippets/next-js/app-router-authentication-api-route.ts" %}
```

Example using Next.js Pages Router:

```typescript
{% include_file "{{ dirname }}/snippets/next-js/pages-router-authentication-api-route.ts" %}
```

### Handling interactive and SDK embeds with the same endpoint

If you have an existing backend endpoint configured for interactive embedding and want to use the same endpoint for SDK embedding, you can differentiate between the requests by checking for the `response=json` query parameter that the SDK adds to its requests.

- For SDK requests, you should return a JSON object with the JWT (`{ jwt: string }`).
- For interactive embedding requests, you would proceed with the redirect.

Here's an example of an Express.js endpoint that handles both:

```typescript
{% include_file "{{ dirname }}/snippets/authentication/express-server-interactive-and-sdk.ts" %}
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

The response should be in the form of `{ jwt: "{JWT_TOKEN}" }`

## Authenticating locally with API keys

> The Embedded analytics SDK only supports JWT authentication in production. Authentication with API keys is only supported for local development and evaluation purposes.

For developing locally to try out the SDK, you can authenticate using an API key.

First, create an [API key](../../people-and-groups/api-keys.md).

Then you can then use the API key to authenticate with Metabase in your application. All you need to do is include your API key in the config object using the key: `apiKey`.

```typescript
{% include_file "{{ dirname }}/snippets/authentication/auth-config-api-key.tsx" %}
```

## Authenticating with SAML SSO

{% include plans-blockquote.html feature="SAML authentication" sdk=true %}

To use SAML single sign-on with the Embedded analytics SDK, you'll need to set up SAML in both your Metabase and your Identity Provider (IdP). See the docs on [SAML-based authentication](../../people-and-groups/authenticating-with-saml.md).

Once SAML is configured in Metabase and your IdP, you can configure the SDK to use SAML by setting the `preferredAuthMethod` in your `MetabaseAuthConfig` to `"saml"`:

```typescript
{% include_file "{{ dirname }}/snippets/authentication/auth-config-saml.tsx" snippet="example" %}
```

Using SAML authentication with the Embedded analytics SDK will typically involve redirecting people to a popup with your Identity Provider's login page for authentication. After successful authentication, the person will be redirected back to the embedded content.

Due to the nature of redirects and popups involved in the SAML flow, SAML authentication with the SDK may not work seamlessly in all embedding contexts, particularly within iframes, depending on browser security policies and your IdP's configuration. We recommend testing auth flows in your target environments.

Unlike JWT authentication, you won't be able to implement a custom `fetchRequestToken` function on your backend when pairing SAML with the SDK.

## Security warning: each end-user _must_ have their own Metabase account

Each end-user _must_ have their own Metabase account.

The problem with having end-users share a Metabase account is that, even if you filter data on the client side via the SDK, all end-users will still have access to the session token, which they could use to access Metabase directly via the API to get data they're not supposed to see.

If each end-user has their own Metabase account, however, you can configure permissions in Metabase and everyone will only have access to the data they should.

In addition to this, we consider shared accounts to be unfair usage. Fair usage of the SDK involves giving each end-user of the embedded analytics their own Metabase account.
