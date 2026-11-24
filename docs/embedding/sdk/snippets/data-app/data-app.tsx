// [<snippet example>]
import {
  DataApp,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <DataApp path="store-explorer" />
    </MetabaseProvider>
  );
}
// [<endsnippet example>]

export const SizedApp = () => (
  // [<snippet size>]
  <DataApp path="store-explorer" height="100vh" />
  // [<endsnippet size>]
);
