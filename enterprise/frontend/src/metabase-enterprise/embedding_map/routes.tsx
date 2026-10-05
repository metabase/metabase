import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import { loadEmbeddingMapPage } from "./lazy";

const embeddingMapPage = () =>
  loadEmbeddingMapPage().then(({ EmbeddingMapPage }) => ({
    Component: EmbeddingMapPage,
  }));

registerPagePrefetch(Urls.dataStudioEmbeddingMap(), embeddingMapPage);

export function getDataStudioEmbeddingMapRoutes() {
  return <Route index lazy={embeddingMapPage} />;
}
