import { t } from "ttag";

import {
  isInstanceAnalyticsCustomCollection,
  isTrashedCollection,
} from "metabase/collections/utils";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";
import { CollectionCleanupAlert } from "./CollectionCleanupAlert";

if (hasPremiumFeature("collection_cleanup")) {
  PLUGIN_COLLECTIONS.canCleanUp = collection => {
    return Boolean(
      !isInstanceAnalyticsCustomCollection(collection) &&
        !isTrashedCollection(collection) &&
        !collection.is_sample &&
        collection.can_write,
    );
  };

  PLUGIN_COLLECTIONS.getCleanUpMenuItems = (collection, itemCount) => {
    if (!PLUGIN_COLLECTIONS.canCleanUp(collection) || itemCount === 0) {
      return [];
    }

    return [
      {
        title: t`Clean things up`,
        icon: "archive",
        link: `${Urls.collection(collection)}/cleanup`,
      },
    ];
  };

  PLUGIN_COLLECTIONS.cleanUpRoute = (
    <ModalRoute path="cleanup" modal={CleanupCollectionModal} />
  );

  PLUGIN_COLLECTIONS.cleanUpAlert = CollectionCleanupAlert;
}
