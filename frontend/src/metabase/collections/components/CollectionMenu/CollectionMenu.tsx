import type React from "react";
import { t } from "ttag";

import {
  isInstanceAnalyticsCustomCollection,
  isRootCollection,
  isRootPersonalCollection,
} from "metabase/collections/utils";
import { useHasDashboardQuestionCandidates } from "metabase/components/MoveQuestionsIntoDashboardsModal/hooks";
import { IndicatorMenu } from "metabase/core/components/IndicatorMenu";
import { ForwardRefLink } from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
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
        acc.concat(<IndicatorMenu.Divider key={`divider-${index}`} />, ...val),
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

  const moveItems = [];
  const cleanupItems = [];
  const editItems = [];
  const trashItems = [];

  if (canMove) {
    moveItems.push(
      <IndicatorMenu.Item
        key="collection-move"
        leftSection={<Icon name="move" />}
        component={ForwardRefLink}
        to={`${url}/move`}
      >{t`Move`}</IndicatorMenu.Item>,
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
      <IndicatorMenu.Item
        key="collection-edit"
        leftSection={<Icon name="lock" />}
        component={ForwardRefLink}
        to={`${url}/permissions`}
      >{t`Edit permissions`}</IndicatorMenu.Item>,
    );
  }

  const { menuItems: cleanupMenuItems } =
    PLUGIN_COLLECTIONS.useGetCleanUpMenuItems(collection);

  cleanupItems.push(...cleanupMenuItems);

  if (hasDqCandidates) {
    cleanupItems.push(
      <IndicatorMenu.ItemWithBadge
        key="collection-move-to-dashboards"
        leftSection={<Icon name="add_to_dash" />}
        component={ForwardRefLink}
        to={`${url}/move-questions-dashboard`}
        userAckKey="move-to-dashboard"
        badgeLabel={t`New`}
      >{t`Move questions into their dashboards`}</IndicatorMenu.ItemWithBadge>,
    );
  }

  if (canMove) {
    trashItems.push(
      <IndicatorMenu.Item
        key="collection-trash"
        leftSection={<Icon name="trash" />}
        component={ForwardRefLink}
        to={`${url}/archive`}
      >{t`Move to trash`}</IndicatorMenu.Item>,
    );
  }

  const items = mergeArrays([moveItems, editItems, cleanupItems, trashItems]);

  if (items.length === 0) {
    return null;
  }

  return (
    <IndicatorMenu position="bottom-end" menuKey="collection-menu">
      <IndicatorMenu.Target>
        <Tooltip label={t`Move, trash, and more...`} position="bottom">
          <ActionIcon size={32} variant="viewHeader">
            <Icon name="ellipsis" color="text-dark" />
          </ActionIcon>
        </Tooltip>
      </IndicatorMenu.Target>

      <IndicatorMenu.Dropdown>{items}</IndicatorMenu.Dropdown>
    </IndicatorMenu>
  );
};
