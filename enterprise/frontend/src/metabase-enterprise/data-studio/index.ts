import { t } from "ttag";

import { setupApplicationPermissionsPlugin } from "metabase/admin/permissions/application-permissions";
import {
  PLUGIN_APPLICATION_PERMISSIONS,
  PLUGIN_DATA_STUDIO,
} from "metabase/plugins";
import { NavbarLibrarySection } from "metabase-enterprise/data-studio/nav/components/NavbarLibrarySection";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DataStudioToolbarButton } from "./query-builder/components/DataStudioToolbarButton";
import { getDataStudioRoutes } from "./routes";
import {
  canAccessDataStudio,
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
  getLibraryCollectionType,
  useGetLibraryChildCollectionByType,
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
    PLUGIN_DATA_STUDIO.useGetLibraryChildCollectionByType =
      useGetLibraryChildCollectionByType;

    setupApplicationPermissionsPlugin();

    PLUGIN_APPLICATION_PERMISSIONS.registerPermission({
      key: "data-studio",
      columnName: t`Data Studio access`,
      columnHint: t`This grants access to the Data Studio`,
    });

    PLUGIN_APPLICATION_PERMISSIONS.selectors.canAccessDataStudio =
      canAccessDataStudio;
  }
}
