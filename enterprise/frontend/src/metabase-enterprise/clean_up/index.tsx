import { t } from "ttag";

import { ForwardRefLink } from "metabase/core/components/Link";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
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
      <Menu.Item
        key="collections-archive"
        icon={<Icon name="archive" />}
        component={ForwardRefLink}
        to={`${Urls.collection(collection)}/cleanup`}
      >{t`Clear out unused items`}</Menu.Item>,
    ];
  };

  PLUGIN_COLLECTIONS.cleanUpRoute = (
    <ModalRoute path="cleanup" modal={CleanupCollectionModal} />
  );

  PLUGIN_COLLECTIONS.cleanUpAlert = CollectionCleanupAlert;
}
