import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const theme = {};

// [<snippet example>]
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "https://app.example.com/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});

export default function App() {
  return (
    <MetabaseProvider
      authConfig={authConfig}
      theme={theme}
      className="optional-class"
    >
      Hello World!
    </MetabaseProvider>
  );
}
// [<endsnippet example>]
