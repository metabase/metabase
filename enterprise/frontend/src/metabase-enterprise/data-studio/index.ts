import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { NavbarLibrarySection } from "metabase-enterprise/data-studio/nav/components/NavbarLibrarySection";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DataStudioToolbarButton } from "./query-builder/components/DataStudioToolbarButton";
import { getDataStudioRoutes } from "./routes";
import { canAccessDataStudio } from "./selectors";
import {
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
  getLibraryCollectionType,
  useGetLibraryChildCollectionByType,
  useGetLibraryCollection,
  useGetResolvedLibraryCollection,
} from "./utils";

export function initializePlugin() {
  // Always enable Data Studio access for admins/analysts on enterprise builds
  // This allows them to see upsells even without the data_studio feature token
  // TODO: when moving to OSS move out of plugin
  PLUGIN_DATA_STUDIO.canAccessDataStudio = canAccessDataStudio;
  PLUGIN_DATA_STUDIO.getDataStudioRoutes = getDataStudioRoutes;

  // Only enable full Data Studio functionality when the feature is present
  if (hasPremiumFeature("data_studio")) {
    PLUGIN_DATA_STUDIO.isEnabled = true;
    PLUGIN_DATA_STUDIO.DataStudioToolbarButton = DataStudioToolbarButton;
    PLUGIN_DATA_STUDIO.NavbarLibrarySection = NavbarLibrarySection;
    PLUGIN_DATA_STUDIO.getLibraryCollectionType = getLibraryCollectionType;
    PLUGIN_DATA_STUDIO.canPlaceEntityInCollection = canPlaceEntityInCollection;
    PLUGIN_DATA_STUDIO.canPlaceEntityInCollectionOrDescendants =
      canPlaceEntityInCollectionOrDescendants;
    PLUGIN_DATA_STUDIO.useGetLibraryCollection = useGetLibraryCollection;
    PLUGIN_DATA_STUDIO.useGetLibraryChildCollectionByType =
      useGetLibraryChildCollectionByType;
    PLUGIN_DATA_STUDIO.useGetResolvedLibraryCollection =
      useGetResolvedLibraryCollection;
  }
}
