import { t } from "ttag";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/core/components/Link";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Badge, Icon, Menu } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";
import { canCleanUp } from "./utils";

if (hasPremiumFeature("collection_cleanup")) {
  PLUGIN_COLLECTIONS.canCleanUp = canCleanUp;

  PLUGIN_COLLECTIONS.useGetCleanUpMenuItems = collection => {
    const canCleanupCollection = canCleanUp(collection);

    const { data: collectionItems } = useListCollectionItemsQuery(
      canCleanupCollection
        ? {
            id: collection.id,
            limit: 0, // only fetch pagination info
          }
        : skipToken,
    );
    const totalCollectionItems = canCleanupCollection
      ? (collectionItems?.total ?? 0)
      : 0;

    if (!canCleanupCollection || totalCollectionItems === 0) {
      return {
        menuItems: [],
        showIndicator: false,
      };
    }

    return {
      menuItems: [
        <Menu.Item
          key="collections-cleanup"
          icon={<Icon name="archive" />}
          component={ForwardRefLink}
          to={`${Urls.collection(collection)}/cleanup`}
          rightSection={<Badge>Recommended</Badge>}
        >{t`Clear out unused items`}</Menu.Item>,
      ],
      showIndicator: true,
    };
  };

  PLUGIN_COLLECTIONS.cleanUpRoute = (
    <ModalRoute path="cleanup" modal={CleanupCollectionModal} />
  );
}
