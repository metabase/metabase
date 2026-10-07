import type { PropsWithChildren } from "react";
import {
  type MetabaseAuthConfig,
  MetabaseProvider,
  defineMetabaseTheme,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

const Example = ({ children }: PropsWithChildren) => {
  // [<snippet example>]
  const theme = defineMetabaseTheme({
    colors: {
      brand: "#509EE3",
    },
  });

  return (
    <MetabaseProvider authConfig={authConfig} theme={theme}>
      {children}
    </MetabaseProvider>
  );
  // [<endsnippet example>]
};
