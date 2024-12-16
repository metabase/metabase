import { t } from "ttag";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";
import { CollectionCleanupAlert } from "./CollectionCleanupAlert";
import { canCleanUp } from "./utils";

if (hasPremiumFeature("collection_cleanup")) {
  PLUGIN_COLLECTIONS.canCleanUp = canCleanUp;

  PLUGIN_COLLECTIONS.getCleanUpMenuItems = (collection, itemCount) => {
    if (!canCleanUp(collection) || itemCount === 0) {
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
