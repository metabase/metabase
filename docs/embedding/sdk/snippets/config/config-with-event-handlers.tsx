import type { PropsWithChildren } from "react";
import {
  MetabaseProvider,
  type SdkDashboardLoadEvent,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "",
});

const Example = ({ children }: PropsWithChildren) => {
  // [<snippet example>]
  const handleDashboardLoad: SdkDashboardLoadEvent = (dashboard) => {
    // Send analytics events, show notifications, etc.
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
