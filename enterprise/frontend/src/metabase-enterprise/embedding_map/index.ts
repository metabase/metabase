import { PLUGIN_EMBEDDING_MAP } from "metabase/plugins";

import { getDataStudioEmbeddingMapRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_EMBEDDING_MAP.isEnabled = true;
  PLUGIN_EMBEDDING_MAP.getDataStudioEmbeddingMapRoutes =
    getDataStudioEmbeddingMapRoutes;
}
