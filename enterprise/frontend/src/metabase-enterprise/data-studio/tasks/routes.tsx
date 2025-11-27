import { IndexRedirect, Route } from "react-router";

import { BrokenItemsPage } from "./pages/BrokenItemsPage";
import { UnreferencedItemsPage } from "./pages/UnreferencedItemsPage";

export function getDataStudioTasksRoutes() {
  return (
    <>
      <IndexRedirect to="broken" />
      <Route path="broken" component={BrokenItemsPage} />
      <Route path="unreferenced" component={UnreferencedItemsPage} />
    </>
  );
}
