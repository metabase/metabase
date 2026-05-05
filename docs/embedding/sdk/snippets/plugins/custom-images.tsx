import {
  InteractiveDashboard,
  type MetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

export default function App() {
  // [<snippet example>]

  const img_base64 = "..."; // base64-encoded image

  const plugins = {
    getNoDataIllustration: () => img_base64,
    getNoObjectIllustration: () => img_base64,
  };

  return (
    <MetabaseProvider authConfig={authConfig} pluginsConfig={plugins}>
      <InteractiveDashboard dashboardId={1} />
    </MetabaseProvider>
  );
  // [<endsnippet example>]
}
