import {
  InteractiveDashboard,
  type MetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

export default function App() {
  // [<snippet example>]
  const plugins = {
    handleLink: (urlString: string) => {
      const url = new URL(urlString, window.location.origin);
      const isInternal = url.origin === window.location.origin;
      if (isInternal) {
        // Handle internal navigation (e.g., with your router)
        console.log("Navigate to:", url.pathname + url.search + url.hash);
        return { handled: true }; // prevent default navigation
      }
      return { handled: false }; // let the SDK do the default behavior
    },
  };

  return (
    <MetabaseProvider authConfig={authConfig} pluginsConfig={plugins}>
      <InteractiveDashboard dashboardId={1} />
    </MetabaseProvider>
  );
  // [<endsnippet example>]
}
