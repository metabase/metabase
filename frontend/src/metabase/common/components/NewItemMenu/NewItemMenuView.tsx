import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DOCUMENTS } from "metabase/plugins";
import { setOpenModal } from "metabase/redux/ui";
import { getSetting } from "metabase/selectors/settings";
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

const NewItemMenuView = ({
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

  const menuItems = useMemo(() => {
    const items = [];

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
            type: "native",
            creationType: "native_question",
            collectionId,
            cardType: "question",
            databaseId: lastUsedDatabaseId || undefined,
          })}
          leftSection={<Icon name="sql" />}
        >
          {hasDatabaseWithJsonEngine ? t`Native query` : t`SQL query`}
        </Menu.Item>,
      );
    }
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

    if (PLUGIN_DOCUMENTS.shouldShowDocumentInNewItemMenu()) {
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
    }

    return items;
  }, [
    hasDataAccess,
    hasNativeWrite,
    collectionId,
    lastUsedDatabaseId,
    hasDatabaseWithJsonEngine,
    dispatch,
  ]);

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Box>{trigger}</Box>
      </Menu.Target>
      <Menu.Dropdown>{menuItems}</Menu.Dropdown>
    </Menu>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemMenuView;
