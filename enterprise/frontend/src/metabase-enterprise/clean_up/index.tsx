import { t } from "ttag";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import { IndicatorMenu } from "metabase/core/components/IndicatorMenu";
import { ForwardRefLink } from "metabase/core/components/Link";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Icon } from "metabase/ui";
import { useListStaleCollectionItemsQuery } from "metabase-enterprise/api/collection";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";
import { getDateFilterValue } from "./CleanupCollectionModal/utils";
import { canCleanUp } from "./utils";

if (hasPremiumFeature("collection_cleanup")) {
  PLUGIN_COLLECTIONS.canCleanUp = canCleanUp;

  PLUGIN_COLLECTIONS.useGetCleanUpMenuItems = collection => {
    const canCleanupCollection = canCleanUp(collection);

    const { currentData: collectionItems } = useListCollectionItemsQuery(
      canCleanupCollection
        ? {
            id: collection.id,
            limit: 0, // only fetch pagination info
          }
        : skipToken,
    );

    const hasCollectionItems = (collectionItems?.total ?? 0) > 0;

    const { currentData: staleItems } = useListStaleCollectionItemsQuery(
      canCleanupCollection && hasCollectionItems
        ? {
            id: collection.id,
            limit: 0, // only fetch pagination info
            before_date: getDateFilterValue("three-months"), // set to 3 months ago
          }
        : skipToken,
    );

    const hasStaleItems = (staleItems?.total ?? 0) > 0;

    if (!canCleanupCollection || !hasCollectionItems) {
      return {
        menuItems: [],
        showIndicator: false,
      };
    }

    return {
      menuItems: [
        <IndicatorMenu.ItemWithBadge
          key="collections-cleanup"
          leftSection={<Icon name="archive" />}
          component={ForwardRefLink}
          to={`${Urls.collection(collection)}/cleanup`}
          badgeLabel={t`Recommended`}
          showBadge={() => hasStaleItems}
          userAckKey="clean-stale-items"
        >{t`Clear out unused items`}</IndicatorMenu.ItemWithBadge>,
      ],
      showIndicator: hasStaleItems,
    };
  };

  PLUGIN_COLLECTIONS.cleanUpRoute = (
    <ModalRoute path="cleanup" modal={CleanupCollectionModal} />
  );
}
