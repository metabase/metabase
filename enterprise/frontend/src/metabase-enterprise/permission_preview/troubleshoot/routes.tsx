import { Route } from "metabase/router";

import { TroubleshootPage } from "./TroubleshootPage";

// Each depth is its own route, like the Data tab's other views:
// the router can't parse optional segment groups.
const TROUBLESHOOT_PATHS = [
  "troubleshoot",
  "troubleshoot/:principalType",
  "troubleshoot/:principalType/:principalId",
];

/** Mounted next to the tabs. */
export function getTabRoutes() {
  return (
    <>
      {TROUBLESHOOT_PATHS.map((path) => (
        <Route key={path} path={path} element={<TroubleshootPage />} />
      ))}
    </>
  );
}
