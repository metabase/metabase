import type { PropsWithChildren } from "react";
import {
  MetabaseProvider,
  type SdkDashboardLoadEvent,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "",
  authProviderUri: "",
});

const Example = ({ children }: PropsWithChildren) => {
  // [<snippet example>]
  const handleDashboardLoad: SdkDashboardLoadEvent = dashboard => {
    /* do whatever you need to do - e.g. send analytics events, show notifications */
  };

  const eventHandlers = {
    onDashboardLoad: handleDashboardLoad,
    onDashboardLoadWithoutCards: handleDashboardLoad,
  };

  return (
    <MetabaseProvider authConfig={authConfig} eventHandlers={eventHandlers}>
      {children}
    </MetabaseProvider>
  );
  // [<endsnippet example>]
};
