import { IndexRedirect, Redirect, Route } from "react-router";

import { UnreferencedItemsPage } from "./pages/UnreferencedItemsPage";

export function getDataStudioTasksRoutes() {
  return (
    <>
      <IndexRedirect to="unreferenced" />
      <Redirect from="unreferenced" to="unreferenced/model" />
      <Route
        path="unreferenced/:entityType"
        component={UnreferencedItemsPage}
      />
    </>
  );
}
