import {
  type MetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";
import type { PropsWithChildren } from "react";

const authConfig = {} as MetabaseAuthConfig;

const Example = ({ children }: PropsWithChildren) => (
  // [<snippet example>]
  <MetabaseProvider
    authConfig={authConfig}
    allowedCustomVisualizations={["custom:Calendar Heatmap", "custom:Thumbs"]}
    // An empty page on your app's origin, served with its own CSP:
    // `default-src 'none'; script-src 'unsafe-eval'`
    customVisualizationsSandboxUrl="/metabase-sandbox.html"
  >
    {children}
  </MetabaseProvider>
  // [<endsnippet example>]
);
