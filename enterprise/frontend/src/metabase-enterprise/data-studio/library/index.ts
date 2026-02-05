import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CreateLibraryModal } from "./components/CreateLibraryModal";
import { PublishTablesModal } from "./components/PublishTablesModal";
import { UnpublishTablesModal } from "./components/UnpublishTablesModal";
import { getDataStudioLibraryRoutes } from "./routes";
import {
  useGetLibraryChildCollectionByType,
  useGetLibraryCollection,
  useGetResolvedLibraryCollection,
} from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("data_studio")) {
    // TODO [OSS]: this should be "library" token
    PLUGIN_LIBRARY.isEnabled = true;
    PLUGIN_LIBRARY.getDataStudioLibraryRoutes = getDataStudioLibraryRoutes;
    PLUGIN_LIBRARY.useGetLibraryCollection = useGetLibraryCollection;
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType =
      useGetLibraryChildCollectionByType;
    PLUGIN_LIBRARY.useGetResolvedLibraryCollection =
      useGetResolvedLibraryCollection;
    PLUGIN_LIBRARY.CreateLibraryModal = CreateLibraryModal;
    PLUGIN_LIBRARY.PublishTablesModal = PublishTablesModal;
    PLUGIN_LIBRARY.UnpublishTablesModal = UnpublishTablesModal;
    PLUGIN_LIBRARY.useGetLibraryCollectionQuery = useGetLibraryCollectionQuery;
  }
}
