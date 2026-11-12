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
    pluginsConfig={{
      // Return the default actions, plus any custom actions you add
      mapQuestionClickActions: (clickActions) => clickActions,
    }}
  >
    {children}
  </MetabaseProvider>
  // [<endsnippet example>]
);
