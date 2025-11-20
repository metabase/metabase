import { useMemo } from "react";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { NavbarLibrarySection } from "metabase-enterprise/data-studio/nav/components/NavbarLibrarySection";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { CollectionItem, CollectionType } from "metabase-types/api";

import { DataStudioToolbarButton } from "./query-builder/components/DataStudioToolbarButton";
import { getDataStudioRoutes } from "./routes";
import {
  canAccessDataStudio,
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
  getLibraryCollectionType,
  useGetLibraryCollection,
} from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("data_studio")) {
    PLUGIN_DATA_STUDIO.isEnabled = true;
    PLUGIN_DATA_STUDIO.canAccessDataStudio = canAccessDataStudio;
    PLUGIN_DATA_STUDIO.getDataStudioRoutes = getDataStudioRoutes;
    PLUGIN_DATA_STUDIO.DataStudioToolbarButton = DataStudioToolbarButton;
    PLUGIN_DATA_STUDIO.NavbarLibrarySection = NavbarLibrarySection;
    PLUGIN_DATA_STUDIO.getLibraryCollectionType = getLibraryCollectionType;
    PLUGIN_DATA_STUDIO.canPlaceEntityInCollection = canPlaceEntityInCollection;
    PLUGIN_DATA_STUDIO.canPlaceEntityInCollectionOrDescendants =
      canPlaceEntityInCollectionOrDescendants;
    PLUGIN_DATA_STUDIO.useGetLibraryCollection = useGetLibraryCollection;
    PLUGIN_DATA_STUDIO.useGetLibraryCollectionQuery = ({
      skip,
    }: { skip?: boolean } = {}) => {
      const { data = null, isLoading } =
        PLUGIN_DATA_STUDIO.useGetLibraryCollectionQuery(undefined, { skip });
      return { data, isLoading };
    };
    PLUGIN_DATA_STUDIO.useGetLibraryChildCollectionByType = ({
      skip,
      type,
    }: {
      skip?: boolean;
      type: CollectionType;
    }) => {
      const { data: rootLibraryCollection } =
        PLUGIN_DATA_STUDIO.useGetLibraryCollectionQuery({ skip });
      const { data: libraryCollections } = useListCollectionItemsQuery(
        rootLibraryCollection ? { id: rootLibraryCollection.id } : skipToken,
      );
      return useMemo(
        () =>
          libraryCollections?.data.find(
            (collection: CollectionItem) => collection.type === type,
          ),
        [libraryCollections, type],
      );
    };
  }
}
