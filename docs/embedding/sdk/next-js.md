---
title: Embedded analytics SDK - Using the SDK with Next.js
---

# Embedded analytics SDK - Using the SDK with Next.js

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

Some notes on using the Embedded analytics SDK with [Next.js](https://nextjs.org/). The SDK is tested to work with Next.js 14, although it may work with other versions.

## Making the SDK components work on Server Side Rendering (SSR) or React Server Components

Currently, the SDK components only work on the browser, this means that using them directly from Server Side Rendering (SSR) or Server Components is not supported.

### Compatibility layer

On the latest releases of the sdk do provide an experimental compatibility layer that wraps all the components with [dynamic imports and disable SSR](https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-no-ssr) for them. The compatibility layer also uses `use client` so that it will work with the app router.

To use the compatibility layer you can change your imports from `@metabase/embedding-sdk-react` to `@metabase/embedding-sdk-react/nextjs`.

This is the easiest way to get up and running with the SDK in Next.js, you can find [sample apps using this approach on github](https://github.com/metabase/metabase-nextjs-sdk-embedding-sample).

## Manual wrapping of the components

If the compatibility layer doesn't work for your use case, for example because you want to customize the loading of the components, you can create your own wrapper.
Here's a suggested way to do it.

First, create a `metabase` folder, and inside it create a file created `EmbeddingSdkProvider.tsx`.
This file will contain the provider with the appropriate configuration.

```tsx
"use client";

import {
  defineMetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: process.env.NEXT_PUBLIC_METABASE_INSTANCE_URL,
  authProviderUri: process.env.NEXT_PUBLIC_METABASE_AUTH_PROVIDER_URI,
});

export const EmbeddingSdkProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <MetabaseProvider authConfig={authConfig}>{children}</MetabaseProvider>
  );
};
```

Then, we need to create a `index.tsx` file that will export all the lazy loaded components:

```tsx
"use client";

import dynamic from "next/dynamic";

import React from "react";

// Lazy load the EmbeddingSdkProvider so and let it render children while it's being loaded
export const EmbeddingSdkProviderLazy = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const EmbeddingSdkProvider = dynamic(
    () =>
      import("./EmbeddingSdkProvider").then(m => {
        return { default: m.EmbeddingSdkProvider };
      }),
    {
      ssr: false,
      loading: () => {
        // render children while loading
        return <div>{children}</div>;
      },
    },
  );

  return <EmbeddingSdkProvider>{children}</EmbeddingSdkProvider>;
};

// Wrap all components that you need like this:

export const StaticQuestion = dynamic(
  () => import("@metabase/embedding-sdk-react").then(m => m.StaticQuestion),
  {
    ssr: false,
    loading: () => {
      return <div>Loading...</div>;
    },
  },
);

export const StaticDashboard = dynamic(
  () => import("@metabase/embedding-sdk-react").then(m => m.StaticDashboard),
  {
    ssr: false,
    loading: () => {
      return <div>Loading...</div>;
    },
  },
);
```

You can now use the components in your pages or components like this:

```tsx
import { StaticQuestion } from "@/metabase"; // path to the folder created earlier

export default function Home() {
  return <StaticQuestion questionId={123} />;
}
```

## Handling authentication

App Router and Pages Router have different ways to define API routes. If you want to authenticate users from your server with JWT, you can follow the instructions below. But if you want to authenticate with API keys for local development, see [Authenticating locally with API keys](./authentication.md#authenticating-locally-with-api-keys).

### Using App Router

You can create a Route handler that signs people in to Metabase.

Create a new `route.ts` file in your `app/*` directory, for example `app/sso/metabase/route.ts` that corresponds to an endpoint at /sso/metabase.

```typescript
import jwt from "jsonwebtoken";

const METABASE_JWT_SHARED_SECRET = process.env.METABASE_JWT_SHARED_SECRET || "";
const METABASE_INSTANCE_URL = process.env.METABASE_INSTANCE_URL || "";

export async function GET() {
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
    const ssoResponse = await fetch(ssoUrl, { method: "GET" });
    const ssoResponseBody = await ssoResponse.json();

    return Response.json(ssoResponseBody);
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(
        {
          status: "error",
          message: "authentication failed",
          error: error.message,
        },
        {
          status: 401,
        },
      );
    }
  }
}
```

Then, pass this `authConfig` to `MetabaseProvider`

```typescript
import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});
```

### Using Pages Router

You can create an API route that signs people in to Metabase.

Create a new `metabase.ts` file in your `pages/api/*` directory, for example `pages/api/sso/metabase.ts` that corresponds to an endpoint at /api/sso/metabase.

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";

const METABASE_JWT_SHARED_SECRET = process.env.METABASE_JWT_SHARED_SECRET || "";
const METABASE_INSTANCE_URL = process.env.METABASE_INSTANCE_URL || "";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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
    const ssoResponse = await fetch(ssoUrl, { method: "GET" });
    const ssoResponseBody = await ssoResponse.json();

    res.status(200).json(ssoResponseBody);
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
```

Then, pass this `authConfig` to `MetabaseProvider`

```ts
import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react/nextjs";
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "/api/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});
```
