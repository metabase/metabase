# Metabase Embedding SDK for React

Metabase Embedding SDK for React offers a way to integrate Metabase into your application in a more seamless way compared to the current interactive embedding offering.

You need to authenticate your users to Metabase using JWT authentication.

## Installation

You can install Metabase Embedding SDK for react via npm:

```bash
npm install @metabase/embedding-sdk-react
```

or using yarn:

```bash
yarn add @metabase/embedding-sdk-react
```

### To use locally build Metabase Embedding SDK for React

First you need to build the Metabase Embedding SDK for React locally:

```bash
yarn build-release:cljs
```

And then run:

```bash
yarn build-embedding-sdk:watch
```

After that you need to add this built SDK package location to your package.json. In this example we assume that your application is located in the same directory as Metabase directory:

```json
"dependencies": {
  "@metabase/embedding-sdk-react": "file:../metabase/resources/embedding-sdk"
}
```

And then you can install the package using npm or yarn:

```bash
npm install
# or
yarn
```

## Usage

Once installed, you need to import `MetabaseProvider` and provide it with a `config` object.

```jsx
import React from "react";
import { MetabaseProvider, useQuestionSearch, InteractiveQuestion} from "@metabase/embedding-sdk-react";

// Configuration
const config = {
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authType: "jwt", // Required
  jwtProviderUri: "https://app.example.com/sso/metabase", // Required: Your endpoint that returns JWT token used to authenticate Metabase. We'll explain more below how to implement this endpoint.
  font: "Lato", // Optional: you could provide any fonts supported by Metabase
}

export default function App() {
  const { data: questions, isLoading } = useQuestionSearch();

  if (loading) {
    return "Loading…"
  }

  // We just assume the logged in user have access to at least 1 question.
  const firstQuestion = questions[0]

  return (
    <MetabaseProvider config={config}>
      <InteractiveQuestion questionId={firstQuestion.id} />
    </MetabaseProvider>
  );
}
```

`MetabaseProvider` also supports `pluginsConfig`. Currently we only allow configuring `mapQuestionClickActions`, but we'll support more plugins in next releases.

```jsx
// You can provide a custom action with your own `onClick` logic.
const createCustomAction = clicked => ({
  buttonType: "horizontal",
  name: "client-custom-action",
  section: "custom",
  type: "custom",
  icon: "chevronright",
  title: "Hello from the click app!!!",
  onClick: ({ closePopover }) => {
    alert(`Clicked ${clicked.column?.name}: ${clicked.value}`);
    closePopover();
  },
});

// Or customize the appearance of the custom action to suit your need.
const createCustomActionWithView = clicked => ({
  name: "client-custom-action-2",
  section: "custom",
  type: "custom",
  view: ({ closePopover }) => (
    <button
      className="tw-text-base tw-text-yellow-900 tw-bg-slate-400 tw-rounded-lg"
      onClick={() => {
        alert(`Clicked ${clicked.column?.name}: ${clicked.value}`);
        closePopover();
      }}
    >
      Custom element
    </button>
  ),
});

const plugins = {
  /**
   * You will have access to default `clickActions` that Metabase render by default.
   * So you could decide if you want to add custom actions, remove certain actions, etc.
   */
  mapQuestionClickActions: (clickActions, clicked) => {
    return [
      ...clickActions,
      createCustomAction(clicked),
      createCustomActionWithView(clicked),
    ]
  }
}

return (
  <MetabaseProvider config={config} pluginsConfig={plugins}>
    <InteractiveQuestion questionId={firstQuestion.id}  />
  </MetabaseProvider>
);
```

After you have configured the SDK, you need to make sure your `jwtProviderUri` endpoint returns JWT token that your Metabase instance can use for authentication.

**Metabase Embedding SDK for React only supports JWT authentication.**

Here is the example how you could implement an endpoint that will return JWT token that Metabase Embedding SDK for react could use to authenticate your users.

```ts
import express from "express"
import type { Request, Response } from "express"

import jwt from "jsonwebtoken"
import fetch from "node-fetch"

async function metabaseAuthHandler(req: Request, res: Response) {
  const { user } = req.session

  if (!user) {
    return res.status(401).json({
      status: 'error',
      message: 'not authenticated',
    })
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
    METABASE_JWT_SHARED_SECRET
  )
  const ssoUrl = `${METABASE_INSTANCE_URL}?token=true&jwt=${token}`

  try {
    const response = await fetch(ssoUrl, { method: 'GET' })
    const token = await response.json()

    return res.status(200).json(token)
  } catch (error) {
    if (error instanceof Error) {
      res.status(401).json({
        status: 'error',
        message: 'authentication failed',
        error: error.message,
      })
    }
  }
}

const app = express()

// middleware
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }),
)
app.use(express.json())

// routes
app.get("/sso/metabase", metabaseAuthHandler)
app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`)
})
```

## Known limitations
- Metabase Embedding SDK only supports React
- It doesn't support SSR
- It doesn't support Vite

______

For a more detailed guide on how to build the Metabase embedding SDK locally, please refer to the [documentation](https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/README.md).

