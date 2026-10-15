import {
  MetabaseProvider,
  StaticDashboard,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

// [<snippet example>]
// A JWT that your server signs with your Metabase embedding secret key.
const token = "YOUR_SIGNED_JWT";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
  isGuest: true,
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <StaticDashboard token={token} />
    </MetabaseProvider>
  );
}
// [<endsnippet example>]
