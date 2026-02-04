import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_METABOT } from "metabase/plugins";
import { setOpenModal } from "metabase/redux/ui";
import { getSetting } from "metabase/selectors/settings";
import { getUserCanWriteToCollections } from "metabase/selectors/user";
import { Box, Icon, Menu } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { trackNewMenuItemClicked } from "./analytics";

export interface NewItemMenuProps {
  className?: string;
  collectionId?: CollectionId;
  trigger?: ReactNode;
  triggerIcon?: string;
  triggerTooltip?: string;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDatabaseWithJsonEngine: boolean;
  onCloseNavbar: () => void;
}

export const NewItemMenuView = ({
  collectionId,
  trigger,
  hasDataAccess,
  hasNativeWrite,
  hasDatabaseWithJsonEngine,
}: NewItemMenuProps) => {
  const dispatch = useDispatch();

  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );

  const canWriteToCollections = useSelector(getUserCanWriteToCollections);

  const menuItems = useMemo(() => {
    const items = [];

    const aiExplorationItem = PLUGIN_METABOT.getNewMenuItemAIExploration(
      hasDataAccess,
      collectionId,
    );
    if (aiExplorationItem) {
      items.push(aiExplorationItem);
    }

    if (hasDataAccess) {
      items.push(
        <Menu.Item
          key="question"
          component={ForwardRefLink}
          to={Urls.newQuestion({
            mode: "notebook",
            creationType: "custom_question",
            collectionId,
            cardType: "question",
          })}
          leftSection={<Icon name="insight" />}
        >
          {t`Question`}
        </Menu.Item>,
      );
    }

    if (hasNativeWrite) {
      items.push(
        <Menu.Item
          key="native"
          component={ForwardRefLink}
          to={Urls.newQuestion({
            DEPRECATED_RAW_MBQL_type: "native",
            creationType: "native_question",
            collectionId,
            cardType: "question",
            DEPRECATED_RAW_MBQL_databaseId: lastUsedDatabaseId || undefined,
          })}
          leftSection={<Icon name="sql" />}
        >
          {hasDatabaseWithJsonEngine ? t`Native query` : t`SQL query`}
        </Menu.Item>,
      );
    }

    if (canWriteToCollections) {
      items.push(
        <Menu.Item
          key="dashboard"
          onClick={() => {
            trackNewMenuItemClicked("dashboard");
            dispatch(setOpenModal("dashboard"));
          }}
          leftSection={<Icon name="dashboard" />}
        >
          {t`Dashboard`}
        </Menu.Item>,
      );
    }

    items.push(
      <Menu.Item
        key="document"
        component={ForwardRefLink}
        to="/document/new"
        leftSection={<Icon name="document" />}
      >
        {t`Document`}
      </Menu.Item>,
    );

    return items;
  }, [
    hasDataAccess,
    hasNativeWrite,
    collectionId,
    lastUsedDatabaseId,
    hasDatabaseWithJsonEngine,
    dispatch,
    canWriteToCollections,
  ]);

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Box>{trigger}</Box>
      </Menu.Target>
      <Menu.Dropdown>{menuItems}</Menu.Dropdown>
    </Menu>
  );
};
