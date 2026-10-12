import { PLUGIN_LIBRARY } from "metabase/plugins";
import { PLUGIN_DATA_REFERENCE } from "metabase/querying/components/DataReference/plugins";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CollectionPermissionsModal } from "./components/CollectionPermissionsModal";
import { CreateLibraryModal } from "./components/CreateLibraryModal";
import { DataReferenceLibraryPane } from "./components/DataReferenceLibraryPane";
import { PublishTablesModal } from "./components/PublishTablesModal";
import { UnpublishTablesModal } from "./components/UnpublishTablesModal";
import { useGetLibraryChildCollectionByType } from "./hooks/use-get-library-child-collection-by-type";
import { useGetLibraryCollection } from "./hooks/use-get-library-collection";
import { useGetResolvedLibraryCollection } from "./hooks/use-get-resolved-library-collection";
import { getDataStudioLibraryRoutes } from "./routes";
import {
  getCollectionPickerItems,
  getEntityPickerSyntheticLibraryItem,
  getLibraryCollectionEmptyStateMessages,
  isLibraryCollectionType,
  isLibraryDataCollectionType,
  isLibrarySubCollectionType,
} from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("library")) {
    PLUGIN_LIBRARY.isEnabled = true;
    PLUGIN_LIBRARY.getDataStudioLibraryRoutes = getDataStudioLibraryRoutes;
    PLUGIN_LIBRARY.useGetLibraryCollection = useGetLibraryCollection;
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType =
      useGetLibraryChildCollectionByType;
    PLUGIN_LIBRARY.useGetResolvedLibraryCollection =
      useGetResolvedLibraryCollection;
    PLUGIN_LIBRARY.getCollectionPickerItems = getCollectionPickerItems;
    PLUGIN_LIBRARY.getEntityPickerSyntheticLibraryItem =
      getEntityPickerSyntheticLibraryItem;
    PLUGIN_DATA_REFERENCE.LibraryPane = DataReferenceLibraryPane;
    PLUGIN_LIBRARY.CreateLibraryModal = CreateLibraryModal;
    PLUGIN_LIBRARY.CollectionPermissionsModal = CollectionPermissionsModal;
    PLUGIN_LIBRARY.PublishTablesModal = PublishTablesModal;
    PLUGIN_LIBRARY.UnpublishTablesModal = UnpublishTablesModal;
    PLUGIN_LIBRARY.useGetLibraryCollectionQuery = useGetLibraryCollectionQuery;
    PLUGIN_LIBRARY.getLibraryCollectionEmptyStateMessages =
      getLibraryCollectionEmptyStateMessages;
    PLUGIN_LIBRARY.isLibraryCollectionType = isLibraryCollectionType;
    PLUGIN_LIBRARY.isLibrarySubCollectionType = isLibrarySubCollectionType;
    PLUGIN_LIBRARY.isLibraryDataCollectionType = isLibraryDataCollectionType;
  }
}
