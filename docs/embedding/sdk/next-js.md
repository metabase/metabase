---
title: Embedded analytics SDK - Using the SDK with Next.js
---

# Embedded analytics SDK - Using the SDK with Next.js

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

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

Next, add an `index.tsx` file to that `metabase` directory. This file will include the `use client` directive, and it'll export a lazy-loaded version of the `EmbeddingSdkProvider` with  SSR disabled.

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

You can now import components like so:

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
