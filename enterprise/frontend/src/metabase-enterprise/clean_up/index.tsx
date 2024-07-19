import { ModalRoute } from "metabase/hoc/ModalRoute";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";

// TODO: remove this once the feature flag is added
if (hasPremiumFeature("clean-up") || !!true) {
  PLUGIN_COLLECTIONS.canCleanUp = true;

  PLUGIN_COLLECTIONS.cleanUpRoute = (
    <ModalRoute path="cleanup" modal={CleanupCollectionModal} />
  );
}
