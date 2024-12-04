---
title: Embedded analytics SDK - Using the SDK with Next.js
---

# Embedded analytics SDK - Using the SDK with Next.js

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

Some notes on using the Embedded analytics SDK with [Next.js](https://nextjs.org/). The SDK is tested to work with Next.js 14, although it may work with other versions.

## Using App Router and Pages Router

Create a component that imports the `MetabaseProvider` and mark it as a React Client component with "use client".

It's fine to leave "use client" in the component even when using the Pages Router, but it's not necessary since the Pages Router doesn't use React Server Components.

```typescript
"use client";

import { MetabaseProvider, StaticQuestion, defineEmbeddingSdkConfig } from "@metabase/embedding-sdk-react";

const config = defineEmbeddingSdkConfig({
//...
}); // Your Metabase SDK configuration

export default function MetabaseComponents() {
  return (
    <MetabaseProvider config={config}>
      <StaticQuestion questionId={QUESTION_ID} />
    </MetabaseProvider>
  );
```

You must use the default export. A named export isn't supported with this setup, and it won't work.

Then, import this component in your page:

```typescript
// page.tsx

const MetabaseComponentsNoSsr = dynamic(
  () => import("@/components/MetabaseComponents"),
  {
    ssr: false,
  },
);

export default function HomePage() {
  return (
    <>
      <MetabaseComponentsNoSsr />
    </>
  );
}
```

To repeat: if you export the component as a named export, it won't work with Next.js. You must use a default export. For example, this _won't_ work:

```typescript
const DynamicAnalytics = dynamic(
  () =>
    import("@/components/MetabaseComponents").then(
      module => module.MetabaseComponents,
    ),
  {
    ssr: false,
  },
);
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

Then, pass this `config` to `MetabaseProvider`

```typescript
import { defineEmbeddingSdkConfig } from "@metabase/embedding-sdk-react";
const config = defineEmbeddingSdkConfig({
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

Then, pass this `config` to `MetabaseProvider`

```ts
import { defineEmbeddingSdkConfig } from "@metabase/embedding-sdk-react";
const config = defineEmbeddingSdkConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "/api/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});
```
