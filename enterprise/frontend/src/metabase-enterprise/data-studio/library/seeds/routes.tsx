import { Route } from "metabase/router";

import { SeedsListPage } from "./pages/SeedsListPage";

export function getDataStudioSeedRoutes() {
  return (
    <Route path="seeds">
      <Route index element={<SeedsListPage />} />
    </Route>
  );
}
