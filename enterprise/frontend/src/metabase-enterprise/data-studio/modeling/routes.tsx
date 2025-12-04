import { IndexRoute, Route } from "react-router";

import { CollectionPage } from "./pages/CollectionPage";
import { ModelingEmptyPage } from "./pages/ModelingEmptyPage";

export function getDataStudioModelingRoutes() {
  return (
    <>
      <IndexRoute component={ModelingEmptyPage} />
      <Route path="collections/:collectionId" component={CollectionPage} />
    </>
  );
}
