import type { MetabaseAuthConfig } from "@metabase/embedding-sdk-react";
// [<snippet imports>]
import {
  MetabaseProvider,
  StaticDashboard,
} from "@metabase/embedding-sdk-react";
// [<endsnippet imports>]

const authConfig = {} as MetabaseAuthConfig;

const Example = () => {
  return (
    // [<snippet example>]
    <MetabaseProvider
      // [<ignore>]
      authConfig={authConfig}
      // [<endignore>]
      loaderComponent={() => <div>Analytics is loading...</div>}
      errorComponent={({ type, message, onClose }) => {
        switch (type) {
          case "fixed":
            return (
              <div style={{ position: "fixed", left: 0, right: 0, bottom: 0 }}>
                There was an error: {message}. <span onClick={onClose}>X</span>
              </div>
            );
          case "relative":
          default:
            return <div>There was an error: {message}</div>;
        }
      }}
    >
      <StaticDashboard dashboardId={1} />
    </MetabaseProvider>
    // [<endsnippet example>]
  );
};
