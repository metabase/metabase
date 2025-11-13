import { Route } from "metabase/hoc/Title";

import { CollectionPage } from "./pages/CollectionPage";

export function getDataStudioModelingRoutes() {
  return <Route path="collections/:collectionId" component={CollectionPage} />;
}
