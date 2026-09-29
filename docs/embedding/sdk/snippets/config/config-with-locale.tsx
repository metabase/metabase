import type { PropsWithChildren } from "react";
import {
  type MetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

const Example = ({ children }: PropsWithChildren) => (
  // [<snippet example>]
  <MetabaseProvider authConfig={authConfig} locale="de">
    {children}
  </MetabaseProvider>
  // [<endsnippet example>]
);
