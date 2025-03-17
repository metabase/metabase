---
title: Embedded analytics SDK - Using the SDK with Next.js
---

# Embedded analytics SDK - Using the SDK with Next.js

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

{% include youtube.html id='UfL8okz36d0' %}

Some notes on using the Embedded analytics SDK with [Next.js](https://nextjs.org/). The SDK is tested to work with Next.js 14, although it may work with other versions.

## SDK components with Server Side Rendering (SSR) or React Server Components

For now, the SDK components are only supported for client-side rendering. To use the SDK components with server-side rendering, or with React Server components, you can either use a compatibility layer or manually wrap the components.

### Compatibility layer for server-side rendering (SSR) (EXPERIMENTAL)

To use SDK components with Next.js, the SDK provides an experimental compatibility layer that [wraps all the components with dynamic imports and disables SSR](https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-no-ssr). To work with the app router, this compatibility layer uses `use client`.

To use the compatibility layer, change your imports from `@metabase/embedding-sdk-react` to `@metabase/embedding-sdk-react/nextjs`.

See a [sample Next.js app that uses this compatibility layer](https://github.com/metabase/metabase-nextjs-sdk-embedding-sample).

## Manual wrapping of the components

If you want to customize the loading of the components, you can create your own wrapper.

In your app, create a `metabase` directory, and add a `EmbeddingSdkProvider.tsx` file to that directory. This file will contain the provider with the appropriate configuration.

```tsx
{% include_file "{{ dirname }}/snippets/next-js/manual-wrapping-embedded-sdk-provider.tsx" snippet="example" %}
```

Next, add an `index.tsx` file to that `metabase` directory. This file will include the `use client` directive, and it'll export a lazy-loaded version of the `EmbeddingSdkProvider` with  SSR disabled.

```tsx
{% include_file "{{ dirname }}/snippets/next-js/manual-wrapping-entrypoint.tsx" snippet="example" %}
```

You can now import components like so:

```tsx
{% include_file "{{ dirname }}/snippets/next-js/manual-wrapping-usage.tsx" %}
```

## Handling authentication

App Router and Pages Router have different ways to define API routes. If you want to authenticate users from your server with JWT, you can follow the instructions below. But if you want to authenticate with API keys for local development, see [Authenticating locally with API keys](./authentication.md#authenticating-locally-with-api-keys).

### Using App Router

You can create a Route handler that signs people in to Metabase.

Create a new `route.ts` file in your `app/*` directory, for example `app/sso/metabase/route.ts` that corresponds to an endpoint at /sso/metabase.

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

Create a new `metabase.ts` file in your `pages/api/*` directory, for example `pages/api/sso/metabase.ts` that corresponds to an endpoint at /api/sso/metabase.

```typescript
{% include_file "{{ dirname }}/snippets/next-js/pages-router-authentication-api-route.ts" snippet="imports" %}

{% include_file "{{ dirname }}/snippets/next-js/pages-router-authentication-api-route.ts" snippet="example" %}
```

Then, pass this `authConfig` to `MetabaseProvider`

```ts
{% include_file "{{ dirname }}/snippets/next-js/authentication-auth-config.tsx" %}
```
