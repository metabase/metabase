import { Route } from "metabase/router";

import { TroubleshootPage } from "../troubleshoot/TroubleshootPage";

import { ApplicationPreviewPage } from "./ApplicationPreviewPage";
import { CollectionPreviewPage } from "./CollectionPreviewPage";
import { DataPreviewPage } from "./DataPreviewPage";

// Each drill-down depth is its own route, like the Data tab's other views:
// the router can't parse optional segment groups.
const PRINCIPAL_PATHS = [
  "preview",
  "preview/:principalType",
  "preview/:principalType/:principalId",
];

const TROUBLESHOOT_PATHS = [
  "troubleshoot",
  "troubleshoot/:principalType",
  "troubleshoot/:principalType/:principalId",
];

const DATA_PATHS = [
  ...PRINCIPAL_PATHS,
  "preview/:principalType/:principalId/database/:databaseId",
  "preview/:principalType/:principalId/database/:databaseId/schema/:schemaName",
];

/** Mounted under the Data tab's `data` route. */
export function getDataRoutes() {
  return DATA_PATHS.map((path) => (
    <Route key={path} path={path} element={<DataPreviewPage />} />
  ));
}

/** Mounted next to the tabs: `<tab>/preview/…`. */
export function getTabRoutes() {
  return (
    <>
      {PRINCIPAL_PATHS.map((path) => (
        <Route
          key={`collections/${path}`}
          path={`collections/${path}`}
          element={
            <CollectionPreviewPage tab="collections" namespace="default" />
          }
        />
      ))}
      {PRINCIPAL_PATHS.map((path) => (
        <Route
          key={`tenant-collections/${path}`}
          path={`tenant-collections/${path}`}
          element={
            <CollectionPreviewPage
              tab="tenant-collections"
              namespace="shared"
            />
          }
        />
      ))}
      {PRINCIPAL_PATHS.map((path) => (
        <Route
          key={`tenant-specific-collections/${path}`}
          path={`tenant-specific-collections/${path}`}
          element={
            <CollectionPreviewPage
              tab="tenant-specific-collections"
              namespace="tenant"
            />
          }
        />
      ))}
      {TROUBLESHOOT_PATHS.map((path) => (
        <Route key={path} path={path} element={<TroubleshootPage />} />
      ))}
      {PRINCIPAL_PATHS.map((path) => (
        <Route
          key={`application/${path}`}
          path={`application/${path}`}
          element={<ApplicationPreviewPage />}
        />
      ))}
    </>
  );
}
