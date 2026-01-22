import { PLUGIN_LIBRARY } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getDataStudioLibraryRoutes } from "./routes";
import {
  useGetLibraryChildCollectionByType,
  useGetLibraryCollection,
  useGetResolvedLibraryCollection,
} from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("data_studio")) {
    PLUGIN_LIBRARY.isEnabled = true;
    PLUGIN_LIBRARY.getDataStudioLibraryRoutes = getDataStudioLibraryRoutes;
    PLUGIN_LIBRARY.useGetLibraryCollection = useGetLibraryCollection;
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType =
      useGetLibraryChildCollectionByType;
    PLUGIN_LIBRARY.useGetResolvedLibraryCollection =
      useGetResolvedLibraryCollection;
  }
}
