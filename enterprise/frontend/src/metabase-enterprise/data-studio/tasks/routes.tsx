import { IndexRedirect, Route } from "react-router";

import { UnreferencedItemsPage } from "./pages/UnreferencedItemsPage";

export function getDataStudioTasksRoutes() {
  return (
    <>
      <IndexRedirect to="unreferenced" />
      <Route path="unreferenced" component={UnreferencedItemsPage} />
    </>
  );
}
