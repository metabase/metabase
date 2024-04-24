# Metabase embedding SDK for React

Metabase embedding SDK for React offers a way to integrate Metabase into your application in a more seamless way compared to the current interactive embedding offering.

## Installation

You can install Metabase embedding SDK for react via npm:

```bash
npm install @metabase/embedding-sdk-react
```

or using yarn:

```bash
yarn add @metabase/embedding-sdk-react
```

## Usage

Once installed, you need to import `MetabaseProvider` and provide it with a `config` object.

```jsx
import React from "react";
import { MetabaseProvider, useQuestionSearch, InteractiveQuestion} from "@metabase/embedding-sdk-react";

// JWT configuration
const jwtConfig = {
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authType: "jwt", // Required: "jwt" or "apiKey"
  jwtProviderUri: "https://app.example.com/sso/metabase", // Required: Your endpoint that returns JWT token used to authenticate Metabase
  font: "Lato", // Optional: you could provide any fonts support by Metabase
}

// API Key configuration
const apiKeyConfig = {
  metabaseInstanceUrl: "https://metabase.example.com",
  authType: "apiKey",
  apiKey: "your_metabase_api_key" // Required: API Key created in your Metabase admin settings.
}

export default function App() {
  const { data: questions, isLoading } = useQuestionSearch();

  if (loading) {
    return "Loading…"
  }

  // We just assume the logged in user have access to at least 1 question.
  const firstQuestion = questions[0]

  return (
    <MetabaseProvider config={jwtConfig}>
      <InteractiveQuestion questionId={firstQuestion.id} />
    </MetabaseProvider>
  );
}
```

## More examples
- [Customer Zero: Embedding SDK demo application](https://github.com/metabase/embedding-sdk-customer-zero)

______

For a more detailed guide on how to build the Metabase embedding SDK locally, please refer to the [documentation](https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/README.md).

