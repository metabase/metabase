import { type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  isInstanceAnalyticsCustomCollection,
  isRootCollection,
  isRootPersonalCollection,
} from "metabase/collections/utils";
import { useHasDashboardQuestionCandidates } from "metabase/components/MoveQuestionsIntoDashboardsModal/hooks";
import { IndicatorMenu } from "metabase/core/components/IndicatorMenu";
import { ForwardRefLink } from "metabase/core/components/Link";
import { UserHasSeen } from "metabase/hoc/UserHasSeen/UserHasSeen";
import { UserHasSeenAll } from "metabase/hoc/UserHasSeen/UserHasSeenAll";
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

const mergeArrays = (arr: ReactNode[][]): ReactNode[] => {
  const filteredArr = arr.filter(v => v.length > 0);
  return filteredArr.length === 0
    ? []
    : filteredArr.reduce((acc, val, index) =>
        acc.concat(<IndicatorMenu.Divider key={`divider-${index}`} />, ...val),
      );
};

export const CollectionMenu = ({
  collection,
  isAdmin,
  isPersonalCollectionChild,
  onUpdateCollection,
}: CollectionMenuProps): JSX.Element | null => {
  const [menuOpen, setMenuOpen] = useState(false);

  const hasDqCandidates = useHasDashboardQuestionCandidates(collection.id);

  const url = Urls.collection(collection);
  const isRoot = isRootCollection(collection);
  const isPersonal = isRootPersonalCollection(collection);
  const isInstanceAnalyticsCustom =
    isInstanceAnalyticsCustomCollection(collection);

  const canWrite = collection.can_write;
  const canMove =
    !isRoot && !isPersonal && canWrite && !isInstanceAnalyticsCustom;

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

  const { menuItems: cleanupMenuItems } =
    PLUGIN_COLLECTIONS.useGetCleanUpMenuItems(collection);

  cleanupItems.push(...cleanupMenuItems);

  if (hasDqCandidates) {
    cleanupItems.push(
      // <IndicatorMenu.ItemWithBadge
      //   key="collection-move-to-dashboards"
      //   leftSection={<Icon name="add_to_dash" />}
      //   component={ForwardRefLink}
      //   to={`${url}/move-questions-dashboard`}
      //   userAckKey="move-to-dashboard"
      //   badgeLabel={t`New`}
      // >{t`Move questions into their dashboards`}</IndicatorMenu.ItemWithBadge>,

      <UserHasSeen key="move-to-dashboard" hasSeenKey="move-to-dashboard">
        {({ isNew, ack }) => (
          <Menu.Item
            leftSection={<Icon name="add_to_dash" />}
            component={ForwardRefLink}
            to={`${url}/move-questions-dashboard`}
            onClick={ack}
            rightSection={isNew ? <Badge>{t`New`}</Badge> : null}
          >{t`Move questions into their dashboards`}</Menu.Item>
        )}
      </UserHasSeen>,
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

  return (
    <UserHasSeenAll menuKey="collection-menu">
      {({ hasSeenAll, handleOpen }) => (
        <Menu
          position="bottom-end"
          opened={menuOpen}
          onChange={setMenuOpen}
          keepMounted
          onOpen={handleOpen}
        >
          <Menu.Target>
            <Tooltip
              label={t`Move, trash, and more...`}
              position="bottom"
              disabled={menuOpen}
            >
              <Indicator disabled={hasSeenAll} size={6}>
                <ActionIcon size={32} variant="viewHeader">
                  <Icon name="ellipsis" color="text-dark" />
                </ActionIcon>
              </Indicator>
            </Tooltip>
          </Menu.Target>

          <Menu.Dropdown>{items}</Menu.Dropdown>
        </Menu>
      )}
    </UserHasSeenAll>
  );
};
