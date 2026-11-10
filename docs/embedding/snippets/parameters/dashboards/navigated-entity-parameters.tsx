import {
  InteractiveDashboard,
  type NavigatedEntityParameterChangePayload,
  type NavigatedEntityParameters,
} from "@metabase/embedding-sdk-react";
import { useState } from "react";

const dashboardId = 1;

const Example = () => {
  // [<snippet example>]
  // Values for each linked dashboard or SQL question, keyed by `navigationId`
  const [navigatedEntityParameters, setNavigatedEntityParameters] =
    useState<NavigatedEntityParameters>({});

  const handleNavigatedEntityParametersChange = (
    payload: NavigatedEntityParameterChangePayload,
  ) => {
    const { navigationId } = payload;

    setNavigatedEntityParameters((previous) => {
      // People came back to a visit: keep the values they had.
      if (payload.source === "initial-state" && previous[navigationId]) {
        return previous;
      }

      // A new visit, or someone changed a filter: store what's applied.
      // For a new visit, you can store other values instead, like
      // { ...payload.defaultParameters, ...payload.clickParameters }
      return { ...previous, [navigationId]: payload.parameters };
    });
  };

  return (
    <InteractiveDashboard
      dashboardId={dashboardId}
      enableEntityNavigation
      navigatedEntityParameters={navigatedEntityParameters}
      onNavigatedEntityParametersChange={handleNavigatedEntityParametersChange}
    />
  );
  // [<endsnippet example>]
};

export { Example };
