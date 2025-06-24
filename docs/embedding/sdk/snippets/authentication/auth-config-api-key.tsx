import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfigApiKey = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com",
  apiKey: "YOUR_API_KEY",
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfigApiKey} className="optional-class">
      Hello World!
    </MetabaseProvider>
  );
}
