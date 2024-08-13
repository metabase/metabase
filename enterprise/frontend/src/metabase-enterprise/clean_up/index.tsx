import { t } from "ttag";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";

if (hasPremiumFeature("collection_cleanup")) {
  PLUGIN_COLLECTIONS.canCleanUp = true;

  PLUGIN_COLLECTIONS.getCleanUpMenuItems = (
    itemCount,
    url,
    isInstanceAnalyticsCustom,
    isTrashed,
    canWrite,
  ) => {
    const canCleanUpCollection =
      itemCount !== 0 && !isInstanceAnalyticsCustom && !isTrashed && canWrite;

    if (!canCleanUpCollection) {
      return [];
    }

    return [
      {
        title: t`Clean things up`,
        icon: "archive",
        link: `${url}/cleanup`,
      },
    ];
  };

  PLUGIN_COLLECTIONS.cleanUpRoute = (
    <ModalRoute path="cleanup" modal={CleanupCollectionModal} />
  );
}
