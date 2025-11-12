import { t } from "ttag";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Badge, Icon, Menu } from "metabase/ui";
import { useListStaleCollectionItemsQuery } from "metabase-enterprise/api/collection";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CleanupCollectionModal } from "./CleanupCollectionModal";
import { getDateFilterValue } from "./CleanupCollectionModal/utils";
import { canCleanUp } from "./utils";

/**
 * Initialize clean_up plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("collection_cleanup")) {
    PLUGIN_COLLECTIONS.canCleanUp = canCleanUp;

    PLUGIN_COLLECTIONS.useGetCleanUpMenuItems = (collection) => {
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
        };
      }

      return {
        menuItems: [
          <UserHasSeen
            key="collections-cleanup"
            id="clean-stale-items"
            withContext={hasStaleItems}
          >
            {() => (
              <Menu.Item
                leftSection={<Icon name="archive" />}
                component={ForwardRefLink}
                to={`${Urls.collection(collection)}/cleanup`}
                rightSection={
                  hasStaleItems ? <Badge>{t`Recommended`}</Badge> : null
                }
              >
                {t`Clear out unused items`}
              </Menu.Item>
            )}
          </UserHasSeen>,
        ],
      };
    };

    PLUGIN_COLLECTIONS.cleanUpRoute = (
      <ModalRoute path="cleanup" modal={CleanupCollectionModal} />
    );
  }
}
