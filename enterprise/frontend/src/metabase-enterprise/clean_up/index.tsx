import { t } from "ttag";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";

// TODO: remove this once the feature flag is added
if (hasPremiumFeature("clean-up") || !!true) {
  PLUGIN_COLLECTIONS.canCleanUp = true;

  PLUGIN_COLLECTIONS.getCleanUpMenuItems = (
    itemCount: number,
    url: string,
    isInstanceAnalyticsCustom: boolean,
    isTrashed: boolean,
    canWrite: boolean,
  ): Array<{ title: string; icon: string; link: string }> => {
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
