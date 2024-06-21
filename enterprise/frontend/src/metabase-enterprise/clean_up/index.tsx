import { ModalRoute } from "metabase/hoc/ModalRoute";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";

// TODO: before merging, remove second conditional
if (hasPremiumFeature("auto_cleanup") || !!true) {
  PLUGIN_COLLECTIONS.canCleanUp = true;

  (PLUGIN_COLLECTIONS.CLEAN_UP_ROUTE as any) = (
    <ModalRoute path="cleanup" modal={CleanupCollectionModal as any} />
  );
}
