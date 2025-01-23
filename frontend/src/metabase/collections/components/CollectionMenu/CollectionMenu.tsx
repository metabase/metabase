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
import { ActionIcon, Badge, Icon, Indicator, Menu, Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

export interface CollectionMenuProps {
  collection: Collection;
  isAdmin: boolean;
  isPersonalCollectionChild: boolean;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}

const mergeArrays = (arr: any[][], separator: any) => {
  const filteredArr = arr.filter(v => v.length > 0);
  return filteredArr.length === 0
    ? []
    : filteredArr.reduce((acc, val) => acc.concat(separator, ...val));
};

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

  const [hasSeenMoveToDashboard, { ack: ackHasMoveToDashboard }] =
    useUserAcknowledgement("move-to-dashboard", true);

  const moveItems = [];
  const cleanupItems = [];
  const editItems = [];
  const trashItems = [];

  if (canMove) {
    moveItems.push(
      <Menu.Item
        icon={<Icon name="lock" />}
        component={ForwardRefLink}
        to={`${url}/move`}
      >{t`Move`}</Menu.Item>,
    );
  }

  if (isAdmin && !isRoot && canWrite) {
    editItems.push(
      ...PLUGIN_COLLECTIONS.getAuthorityLevelMenuItems(
        collection,
        onUpdateCollection,
      ),
    );
  }

  if (isAdmin && !isPersonal && !isPersonalCollectionChild) {
    editItems.push(
      <Menu.Item
        icon={<Icon name="lock" />}
        component={ForwardRefLink}
        to={`${url}/permissions`}
      >{t`Edit permissions`}</Menu.Item>,
    );
  }

  cleanupItems.push(
    ...PLUGIN_COLLECTIONS.getCleanUpMenuItems(
      collection,
      maybeCollectionItemCount,
    ),
  );

  if (hasDqCandidates) {
    cleanupItems.push(
      <Menu.Item
        icon={<Icon name="add_to_dash" />}
        component={ForwardRefLink}
        to={`${url}/move-questions-dashboard`}
        rightSection={
          !hasSeenMoveToDashboard && <Badge variant="light">New</Badge>
        }
        onClick={() => !hasSeenMoveToDashboard && ackHasMoveToDashboard()}
      >{t`Move questions into their dashboards`}</Menu.Item>,
    );
  }

  if (canMove) {
    trashItems.push(
      <Menu.Item
        icon={<Icon name="trash" />}
        component={ForwardRefLink}
        to={`${url}/archive`}
      >{t`Move to trash`}</Menu.Item>,
    );
  }

  const items = mergeArrays(
    [moveItems, editItems, cleanupItems, trashItems],
    <Menu.Divider />,
  );

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
