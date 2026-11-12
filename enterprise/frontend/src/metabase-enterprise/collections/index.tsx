import { t } from "ttag";

import { PLUGIN_ENTITY_ICON } from "metabase/hooks/plugins";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CollectionInstanceAnalyticsIcon } from "./components/CollectionInstanceAnalyticsIcon";
import { CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID } from "./constants";
import { useGetDefaultCollectionId } from "./use-get-default-collection-id";
import {
  filterOutItemsFromInstanceAnalytics,
  getCollectionType,
  useGetIcon,
} from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("remote_sync") || hasPremiumFeature("audit_app")) {
    PLUGIN_ENTITY_ICON.useGetIcon = useGetIcon;
  }

  if (hasPremiumFeature("audit_app")) {
    PLUGIN_COLLECTIONS.filterOutItemsFromInstanceAnalytics =
      filterOutItemsFromInstanceAnalytics;
    PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon =
      CollectionInstanceAnalyticsIcon;
    PLUGIN_COLLECTIONS.getCollectionType = getCollectionType;
    PLUGIN_COLLECTIONS.useGetDefaultCollectionId = useGetDefaultCollectionId;
    PLUGIN_COLLECTIONS.CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID =
      CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID;
    PLUGIN_COLLECTIONS.getInstanceAnalyticsAdminReadonlyMessage = () =>
      t`This instance analytics collection is read-only for admin users`;
  }
}
