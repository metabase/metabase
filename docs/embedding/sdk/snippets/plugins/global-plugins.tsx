import type { PropsWithChildren } from "react";
import {
  type MetabaseAuthConfig,
  MetabaseProvider,
  type MetabaseTheme,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;
const theme = {} as MetabaseTheme;

const Example = ({ children }: PropsWithChildren) => (
  // [<snippet example>]
  <MetabaseProvider
    authConfig={authConfig}
    theme={theme}
    pluginsConfig={{
      mapQuestionClickActions: () => [], // Add your custom actions here
    }}
  >
    {children}
  </MetabaseProvider>
  // [<endsnippet example>]
);
