import { type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  isDedicatedTenantCollectionRoot,
  isInstanceAnalyticsCustomCollection,
  isPersonalCollection,
  isRootCollection,
  isRootPersonalCollection,
} from "metabase/collections/utils";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useHasDashboardQuestionCandidates } from "metabase/common/components/MoveQuestionsIntoDashboardsModal/hooks";
import { UserHasSeenAll } from "metabase/common/components/UserHasSeen/UserHasSeenAll";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS, PLUGIN_TENANTS } from "metabase/plugins";
import { ActionIcon, Icon, Indicator, Menu, Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

export interface CollectionMenuProps {
  collection: Collection;
  isAdmin: boolean;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}

const mergeArrays = (arr: ReactNode[][]): ReactNode[] => {
  const filteredArr = arr.filter((v) => v.length > 0);
  return filteredArr.length === 0
    ? []
    : filteredArr.reduce((acc, val, index) =>
        acc.concat(<Menu.Divider key={`divider-${index}`} />, ...val),
      );
};

export const CollectionMenu = ({
  collection,
  isAdmin,
  onUpdateCollection,
}: CollectionMenuProps): JSX.Element | null => {
  const [menuOpen, setMenuOpen] = useState(false);

  const hasDqCandidates = useHasDashboardQuestionCandidates(collection.id);

  const url = Urls.collection(collection);
  const isRoot = isRootCollection(collection);
  const isPersonal = isPersonalCollection(collection);
  const isInstanceAnalyticsCustom =
    isInstanceAnalyticsCustomCollection(collection);
  const isSharedTenantCollection =
    PLUGIN_TENANTS.isTenantCollection(collection);

  const canWrite = collection.can_write;
  const canMove =
    !isRoot &&
    !isRootPersonalCollection(collection) &&
    !isDedicatedTenantCollectionRoot(collection) &&
    canWrite &&
    !isInstanceAnalyticsCustom;

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

  if (
    isAdmin &&
    !isPersonal &&
    !isDedicatedTenantCollectionRoot(collection) &&
    !isSharedTenantCollection
  ) {
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
      <Menu.Item
        leftSection={<Icon name="add_to_dash" />}
        component={ForwardRefLink}
        to={`${url}/move-questions-dashboard`}
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

  return (
    <UserHasSeenAll id="collection-menu">
      {({ hasSeenAll, handleUpdate }) => (
        <Menu
          position="bottom-end"
          opened={menuOpen}
          onChange={setMenuOpen}
          keepMounted
          onOpen={handleUpdate}
        >
          <Menu.Target>
            <Tooltip
              label={t`Move, trash, and more...`}
              position="bottom"
              disabled={menuOpen}
            >
              <Indicator
                disabled={hasSeenAll}
                size={6}
                offset={6}
                data-testid="menu-indicator-root"
              >
                <ActionIcon size={32} variant="viewHeader">
                  <Icon name="ellipsis" c="text-primary" />
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
