import { IndexRoute } from "react-router";

import { Route } from "metabase/hoc/Title";

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
