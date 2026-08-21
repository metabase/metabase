import type { ComponentType } from "react";

import { Route } from "metabase/router";

import { CleanupPage } from "./pages/CleanupPage";
import { CleanupTablePage } from "./pages/CleanupTablePage";

export function getDataStudioCleanupRoutes(IsAdmin: ComponentType) {
  return (
    <Route path="cleanup" element={<IsAdmin />}>
      <Route index element={<CleanupPage />} />
      <Route path="tables/:tableId" element={<CleanupTablePage />} />
    </Route>
  );
}
