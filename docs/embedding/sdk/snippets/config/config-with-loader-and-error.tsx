import type { PropsWithChildren } from "react";
import {
  type MetabaseAuthConfig,
  MetabaseProvider,
  type SdkErrorComponent,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

const MyLoader = () => <div>Analytics is loading...</div>;
const MyError: SdkErrorComponent = ({ message }) => (
  <div>There was an error: {message}</div>
);

const Example = ({ children }: PropsWithChildren) => (
  // [<snippet example>]
  <MetabaseProvider
    authConfig={authConfig}
    loaderComponent={MyLoader}
    errorComponent={MyError}
  >
    {children}
  </MetabaseProvider>
  // [<endsnippet example>]
);
