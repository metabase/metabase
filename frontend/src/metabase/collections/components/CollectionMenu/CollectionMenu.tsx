import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";
import {
  isInstanceAnalyticsCustomCollection,
  isRootCollection,
  isRootPersonalCollection,
} from "metabase/collections/utils";
import { useHasDashboardQuestionCandidates } from "metabase/components/MoveQuestionsIntoDashboardsModal/hooks";
import { ForwardRefLink } from "metabase/core/components/Link";
import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

// eslint-disable-next-line
import { Badge, Indicator } from "@mantine/core";

export interface CollectionMenuProps {
  collection: Collection;
  isAdmin: boolean;
  isPersonalCollectionChild: boolean;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}

export const CollectionMenu = ({
  collection,
  isAdmin,
  isPersonalCollectionChild,
  onUpdateCollection,
}: CollectionMenuProps): JSX.Element | null => {
  // only get the count of items in the collection if we need it
  const maybeCollectionItemCount =
    useListCollectionItemsQuery(
      {
        id: collection.id,
        limit: 0, // we don't want any of the items, we just want to know how many there are in the collection
      },
      {
        skip: !PLUGIN_COLLECTIONS.canCleanUp(collection),
      },
    ).data?.total ?? 0;
  const hasDqCandidates = useHasDashboardQuestionCandidates(collection.id);

  const items = [];
  const url = Urls.collection(collection);
  const isRoot = isRootCollection(collection);
  const isPersonal = isRootPersonalCollection(collection);
  const isInstanceAnalyticsCustom =
    isInstanceAnalyticsCustomCollection(collection);

  const canWrite = collection.can_write;
  const canMove =
    !isRoot && !isPersonal && canWrite && !isInstanceAnalyticsCustom;

  const [hasSeenMenu, { ack: ackHasSeenMenu }] = useUserAcknowledgement(
    "collection-menu",
    true,
  );

  if (isAdmin && !isRoot && canWrite) {
    items.push(
      ...PLUGIN_COLLECTIONS.getAuthorityLevelMenuItems(
        collection,
        onUpdateCollection,
      ),
    );
  }

  if (isAdmin && !isPersonal && !isPersonalCollectionChild) {
    items.push(
      <Menu.Item
        icon={<Icon name="lock" />}
        component={ForwardRefLink}
        to={`${url}/permissions`}
      >{t`Edit permissions`}</Menu.Item>,
    );
  }

  if (canMove) {
    items.push(
      <Menu.Item
        icon={<Icon name="lock" />}
        component={ForwardRefLink}
        to={`${url}/move`}
      >{t`Move`}</Menu.Item>,
    );
  }

  items.push(
    ...PLUGIN_COLLECTIONS.getCleanUpMenuItems(
      collection,
      maybeCollectionItemCount,
    ),
  );

  if (hasDqCandidates) {
    items.push(
      <Menu.Item
        icon={<Icon name="add_to_dash" />}
        component={ForwardRefLink}
        to={`${url}/move-questions-dashboard`}
        rightSection={
          <Badge
            styles={{
              inner: {
                color: "white",
              },
            }}
          >
            Woooo
          </Badge>
        }
      >{t`Move questions into their dashboards`}</Menu.Item>,
    );
  }

  if (canMove) {
    items.push(
      <Menu.Item
        icon={<Icon name="trash" />}
        component={ForwardRefLink}
        to={`${url}/archive`}
      >{t`Move to trash`}</Menu.Item>,
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <Menu
      position="bottom-end"
      onChange={() => {
        if (!hasSeenMenu) {
          ackHasSeenMenu();
        }
      }}
    >
      <Menu.Target>
        <Indicator size={6} disabled={hasSeenMenu}>
          <Tooltip label={t`Move, trash, and more...`} position="bottom">
            <ActionIcon size={32} variant="viewHeader">
              <Icon name="ellipsis" color="text-dark" />
            </ActionIcon>
          </Tooltip>
        </Indicator>
      </Menu.Target>

      <Menu.Dropdown>{items}</Menu.Dropdown>
    </Menu>
  );
};
