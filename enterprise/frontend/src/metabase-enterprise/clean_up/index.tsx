import { t } from "ttag";

import { ForwardRefLink } from "metabase/core/components/Link";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Icon, Menu, Badge } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";
import { CollectionCleanupAlert } from "./CollectionCleanupAlert";
import { canCleanUp } from "./utils";
import { useListStaleCollectionItemsQuery } from "metabase-enterprise/api/collection";
import { skipToken } from "metabase/api";
import { getDateFilterValue } from "./CleanupCollectionModal/utils";
import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";

if (hasPremiumFeature("collection_cleanup")) {
  PLUGIN_COLLECTIONS.canCleanUp = canCleanUp;

  PLUGIN_COLLECTIONS.getCleanUpMenuItems = collection => {
    const canCleanupCollection = canCleanUp(collection);

    const { data: staleItems } = useListStaleCollectionItemsQuery(
      canCleanupCollection
        ? {
            id: collection.id,
            limit: 0, // only fetch pagination info
            before_date: getDateFilterValue("three-months"), // set to 3 months ago
          }
        : skipToken,
    );
    const totalStaleItems = canCleanupCollection ? (staleItems?.total ?? 0) : 0;

    console.log({
      canCleanupCollection,
      totalStaleItems,
    });

    if (!canCleanupCollection || totalStaleItems === 0) {
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

  PLUGIN_COLLECTIONS.cleanUpAlert = CollectionCleanupAlert;
}
