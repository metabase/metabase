import { t } from "ttag";

import {
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { Collection } from "metabase-types/api";

import { CollectionAuthorityLevelDisplay } from "./components/CollectionAuthorityLevelDisplay";
import { CollectionAuthorityLevelIcon } from "./components/CollectionAuthorityLevelIcon";
import { CollectionInstanceAnalyticsIcon } from "./components/CollectionInstanceAnalyticsIcon";
import { FormCollectionAuthorityLevel } from "./components/FormCollectionAuthorityLevel";
import {
  AUTHORITY_LEVELS,
  CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID,
  OFFICIAL_COLLECTION,
  REGULAR_COLLECTION,
} from "./constants";
import { useGetDefaultCollectionId } from "./use-get-default-collection-id";
import {
  filterOutItemsFromInstanceAnalytics,
  getCollectionType,
  getIcon,
  isRegularCollection,
} from "./utils";

if (hasPremiumFeature("official_collections")) {
  PLUGIN_COLLECTIONS.isRegularCollection = isRegularCollection;

  PLUGIN_COLLECTIONS.REGULAR_COLLECTION = REGULAR_COLLECTION;

  PLUGIN_COLLECTIONS.AUTHORITY_LEVEL = AUTHORITY_LEVELS;

  PLUGIN_COLLECTIONS.getIcon = getIcon;

  PLUGIN_COLLECTIONS.getAuthorityLevelMenuItems = (
    collection: Collection,
    onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ) => {
    if (isRegularCollection(collection)) {
      return [
        {
          title: t`Make official`,
          icon: OFFICIAL_COLLECTION.icon,
          action: () =>
            onUpdate(collection, {
              authority_level: OFFICIAL_COLLECTION.type,
            }),
        },
      ];
    } else {
      return [
        {
          title: t`Remove Official badge`,
          icon: "close",
          action: () =>
            onUpdate(collection, {
              authority_level: REGULAR_COLLECTION.type,
            }),
        },
      ];
    }
  };

  PLUGIN_COLLECTIONS.filterOutItemsFromInstanceAnalytics =
    filterOutItemsFromInstanceAnalytics;

  PLUGIN_COLLECTION_COMPONENTS.FormCollectionAuthorityLevelPicker =
    FormCollectionAuthorityLevel;

  PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon =
    CollectionAuthorityLevelIcon;

  PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelDisplay =
    CollectionAuthorityLevelDisplay;
}

if (hasPremiumFeature("audit_app")) {
  PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon =
    CollectionInstanceAnalyticsIcon;

  PLUGIN_COLLECTIONS.getCollectionType = getCollectionType;
  PLUGIN_COLLECTIONS.useGetDefaultCollectionId = useGetDefaultCollectionId;
  PLUGIN_COLLECTIONS.CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID =
    CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID;

  PLUGIN_COLLECTIONS.INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE = t`This instance analytics collection is read-only for admin users`;
}
