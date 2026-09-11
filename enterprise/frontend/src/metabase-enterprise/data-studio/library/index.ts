import { PLUGIN_LIBRARY, lazyPluginComponent } from "metabase/plugins";
import { PLUGIN_DATA_REFERENCE } from "metabase/querying/components/DataReference/plugins";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getDataStudioLibraryRoutes } from "./routes";
import {
  getCollectionPickerItems,
  getEntityPickerSyntheticLibraryItem,
  getLibraryCollectionEmptyStateMessages,
  isLibraryCollectionType,
  isLibraryDataCollectionType,
  isLibrarySubCollectionType,
  useGetLibraryChildCollectionByType,
  useGetLibraryCollection,
  useGetResolvedLibraryCollection,
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
    PLUGIN_DATA_REFERENCE.LibraryPane = lazyPluginComponent(() =>
      import("./DataReferenceLibraryPane").then(
        ({ DataReferenceLibraryPane }) => DataReferenceLibraryPane,
      ),
    );
    PLUGIN_LIBRARY.CreateLibraryModal = lazyPluginComponent(() =>
      import("./components/CreateLibraryModal").then(
        ({ CreateLibraryModal }) => CreateLibraryModal,
      ),
    );
    PLUGIN_LIBRARY.CollectionPermissionsModal = lazyPluginComponent(() =>
      import("./components/CollectionPermissionsModal").then(
        ({ CollectionPermissionsModal }) => CollectionPermissionsModal,
      ),
    );
    PLUGIN_LIBRARY.PublishTablesModal = lazyPluginComponent(() =>
      import("./components/PublishTablesModal").then(
        ({ PublishTablesModal }) => PublishTablesModal,
      ),
    );
    PLUGIN_LIBRARY.UnpublishTablesModal = lazyPluginComponent(() =>
      import("./components/UnpublishTablesModal").then(
        ({ UnpublishTablesModal }) => UnpublishTablesModal,
      ),
    );
    PLUGIN_LIBRARY.useGetLibraryCollectionQuery = useGetLibraryCollectionQuery;
    PLUGIN_LIBRARY.getLibraryCollectionEmptyStateMessages =
      getLibraryCollectionEmptyStateMessages;
    PLUGIN_LIBRARY.isLibraryCollectionType = isLibraryCollectionType;
    PLUGIN_LIBRARY.isLibrarySubCollectionType = isLibrarySubCollectionType;
    PLUGIN_LIBRARY.isLibraryDataCollectionType = isLibraryDataCollectionType;
  }
}
