import type React from "react";
import { t } from "ttag";

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

const mergeArrays = (arr: React.ReactNode[][]): React.ReactNode[] => {
  const filteredArr = arr.filter(v => v.length > 0);
  return filteredArr.length === 0
    ? []
    : filteredArr.reduce((acc, val, index) =>
        acc.concat(<Menu.Divider key={`divider-${index}`} />, ...val),
      );
};

export const CollectionMenu = ({
  collection,
  isAdmin,
  isPersonalCollectionChild,
  onUpdateCollection,
}: CollectionMenuProps): JSX.Element | null => {
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
        key="collection-move"
        leftSection={<Icon name="move" />}
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
        key="collection-edit"
        leftSection={<Icon name="lock" />}
        component={ForwardRefLink}
        to={`${url}/permissions`}
      >{t`Edit permissions`}</Menu.Item>,
    );
  }

  const { menuItems: cleanupMenuItems, showIndicator: showCleanupIndicator } =
    PLUGIN_COLLECTIONS.useGetCleanUpMenuItems(collection);

  cleanupItems.push(...cleanupMenuItems);

  if (hasDqCandidates) {
    cleanupItems.push(
      <Menu.Item
        key="collection-move-to-dashboards"
        leftSection={<Icon name="add_to_dash" />}
        component={ForwardRefLink}
        to={`${url}/move-questions-dashboard`}
        rightSection={!hasSeenMoveToDashboard && <Badge>New</Badge>}
        onClick={() => !hasSeenMoveToDashboard && ackHasMoveToDashboard()}
      >{t`Move questions into their dashboards`}</Menu.Item>,
    );
  }

  if (canMove) {
    trashItems.push(
      <Menu.Item
        key="collection-trash"
        leftSection={<Icon name="trash" />}
        component={ForwardRefLink}
        to={`${url}/archive`}
      >{t`Move to trash`}</Menu.Item>,
    );
  }

  const items = mergeArrays([moveItems, editItems, cleanupItems, trashItems]);

  if (items.length === 0) {
    return null;
  }

  const showIndicator =
    !hasSeenMenu &&
    ((!hasSeenMoveToDashboard && hasDqCandidates) || showCleanupIndicator);

  return (
    <Menu
      position="bottom-end"
      onChange={() => {
        if (!hasSeenMenu && showIndicator) {
          ackHasSeenMenu();
        }
      }}
    >
      <Menu.Target>
        <Indicator
          size={6}
          disabled={!showIndicator}
          label={<span data-testid="indicator" />}
        >
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
