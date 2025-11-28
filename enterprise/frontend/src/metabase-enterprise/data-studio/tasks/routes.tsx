import { IndexRedirect, Redirect, Route } from "react-router";

import { BrokenItemsPage } from "./pages/BrokenItemsPage";
import { UnreferencedItemsPage } from "./pages/UnreferencedItemsPage";

export function getDataStudioTasksRoutes() {
  return (
    <>
      <IndexRedirect to="unreferenced" />
      <Route path="broken" component={BrokenItemsPage} />
      <Redirect from="unreferenced" to="unreferenced/model" />
      <Route
        path="unreferenced/:entityType"
        component={UnreferencedItemsPage}
      />
    </>
  );
}
