import { t } from "ttag";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import type { Collection } from "metabase-types/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CollectionAuthorityLevelIcon } from "./components/CollectionAuthorityLevelIcon";
import { FormCollectionAuthorityLevel } from "./components/FormCollectionAuthorityLevel";
import {
  AUTHORITY_LEVELS,
  REGULAR_COLLECTION,
  OFFICIAL_COLLECTION,
} from "./constants";
import { isRegularCollection } from "./utils";

if (hasPremiumFeature("official_collections")) {
  PLUGIN_COLLECTIONS.isRegularCollection = isRegularCollection;

  PLUGIN_COLLECTIONS.REGULAR_COLLECTION = REGULAR_COLLECTION;

  PLUGIN_COLLECTIONS.AUTHORITY_LEVEL = AUTHORITY_LEVELS;

  PLUGIN_COLLECTIONS.getAuthorityLevelMenuItems = (
    collection: Collection,
    onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ) => {
    if (isRegularCollection(collection)) {
      return [
        {
          title: t`Make collection official`,
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

  PLUGIN_COLLECTION_COMPONENTS.FormCollectionAuthorityLevelPicker =
    FormCollectionAuthorityLevel;

  PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon =
    CollectionAuthorityLevelIcon;
}
