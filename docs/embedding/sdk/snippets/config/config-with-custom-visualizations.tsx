import type { PropsWithChildren } from "react";
import {
  type MetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

const Example = ({ children }: PropsWithChildren) => (
  // [<snippet example>]
  <MetabaseProvider
    authConfig={authConfig}
    // Allowlist the custom visualizations to load, by their plugin names,
    // each prefixed with `custom:`.
    allowedCustomVisualizations={["custom:Calendar", "custom:Thumbs"]}
  >
    {children}
  </MetabaseProvider>
  // [<endsnippet example>]
);
