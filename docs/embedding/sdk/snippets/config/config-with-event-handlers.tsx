import type { PropsWithChildren } from "react";
import {
  type MetabaseAuthConfig,
  MetabaseProvider,
  type SdkDashboardLoadEvent,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

const Example = ({ children }: PropsWithChildren) => {
  // [<snippet example>]
  const handleDashboardLoad: SdkDashboardLoadEvent = (dashboard) => {
    // Send analytics events, show notifications, etc.
  };

  const eventHandlers = {
    onDashboardLoad: handleDashboardLoad,
  };

  return (
    <MetabaseProvider authConfig={authConfig} eventHandlers={eventHandlers}>
      {children}
    </MetabaseProvider>
  );
  // [<endsnippet example>]
};
