import { ModalRoute } from "metabase/hoc/ModalRoute";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";

if (hasPremiumFeature("auto_cleanup") || !!true) {
  PLUGIN_COLLECTIONS.canCleanUp = true;

  PLUGIN_COLLECTIONS.cleanUpRoute = (
    <ModalRoute path="cleanup" modal={CleanupCollectionModal} />
  );
}
