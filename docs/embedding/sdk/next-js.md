---
title: Embedded analytics SDK - Using the SDK with Next.js
---

# Embedded analytics SDK - Using the SDK with Next.js

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

{% include youtube.html id='UfL8okz36d0' %}

Some notes on using the Embedded analytics SDK with [Next.js](https://nextjs.org/). The SDK is tested to work with Next.js 14, although it may work with other versions.

See a [sample Next.js app that uses the SDK](https://github.com/metabase/metabase-nextjs-sdk-embedding-sample).

## SDK components with Server Side Rendering (SSR) or React Server Components

As of Embedded Analytics SDK v57, SDK components automatically skip server-side rendering (SSR) and render only on the client.

### Compatibility layer for Server Side Rendering (SSR) (DEPRECATED)

As of Embedded Analytics SDK 57, the compatibility layer for server-side rendering (SSR) is deprecated and no longer required. If you use the compatibility layer, change your imports from `@metabase/embedding-sdk-react/next` to `@metabase/embedding-sdk-react`.

## Handling authentication

App Router and Pages Router have different ways to define API routes. If you want to authenticate users from your server with JWT, you can follow the instructions below. But if you want to authenticate with API keys for local development, see [Authenticating locally with API keys](./authentication.md#authenticating-locally-with-api-keys).

### Using App Router

You can create a Route handler that signs people in to Metabase.

Create a new `route.ts` file in your `app/*` directory, for example `app/sso/metabase/route.ts` that corresponds to an endpoint at /sso/metabase. This route handler should generate a JWT for the authenticated user and return the token in a JSON object with the shape `{ jwt: string }`.

```typescript
{% include_file "{{ dirname }}/snippets/next-js/app-router-authentication-api-route.ts" snippet="imports" %}

{% include_file "{{ dirname }}/snippets/next-js/app-router-authentication-api-route.ts" snippet="example" %}
```

Then, pass this `authConfig` to `MetabaseProvider`

```typescript
{% include_file "{{ dirname }}/snippets/next-js/authentication-auth-config.tsx" %}
```

### Using Pages Router

You can create an API route that signs people in to Metabase.

Create a new `metabase.ts` file in your `pages/api/*` directory, for example `pages/api/sso/metabase.ts` that corresponds to an endpoint at /api/sso/metabase. This API route should generate a JWT for the authenticated user and return the token in a JSON object with the shape `{ jwt: string }`.

```typescript
{% include_file "{{ dirname }}/snippets/next-js/pages-router-authentication-api-route.ts" snippet="imports" %}

{% include_file "{{ dirname }}/snippets/next-js/pages-router-authentication-api-route.ts" snippet="example" %}
```

Then, pass this `authConfig` to `MetabaseProvider`

```ts
{% include_file "{{ dirname }}/snippets/next-js/authentication-auth-config.tsx" %}
```
