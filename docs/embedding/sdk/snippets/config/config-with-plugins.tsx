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
    pluginsConfig={{
      mapQuestionClickActions: () => [], // Add your custom actions here
    }}
  >
    {children}
  </MetabaseProvider>
  // [<endsnippet example>]
);
