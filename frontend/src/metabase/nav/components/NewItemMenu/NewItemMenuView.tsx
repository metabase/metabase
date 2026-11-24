import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { getUserCanWriteToCollections } from "metabase/current-user";
import { NewMenuItemAIExploration } from "metabase/metabot/components/NewMenuItemAIExploration";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModal } from "metabase/redux/ui";
import { getSetting } from "metabase/settings";
import { Box, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
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
  onCloseNavbar,
}: NewItemMenuProps) => {
  const dispatch = useDispatch();
  const buildQuestion = useQuestionFromOptsBuilder();

  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );

  const canWriteToCollections = useSelector(getUserCanWriteToCollections);

  const { hasNlqAccess } = useUserMetabotPermissions();

  const menuItems = useMemo(() => {
    const items = [];

    if (hasDataAccess && hasNlqAccess) {
      items.push(<NewMenuItemAIExploration key="nlq" />);
    }

    if (hasDataAccess) {
      items.push(
        <Menu.Item
          key="question"
          component={ForwardRefLink}
          to={Urls.newQuestion(
            buildQuestion({ collectionId, cardType: "question" }),
            { mode: "notebook", creationType: "custom_question" },
          )}
          onClick={onCloseNavbar}
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
          to={Urls.newQuestion(
            buildQuestion({
              DEPRECATED_RAW_MBQL_type: "native",
              collectionId,
              cardType: "question",
              DEPRECATED_RAW_MBQL_databaseId: lastUsedDatabaseId || undefined,
            }),
            { creationType: "native_question" },
          )}
          onClick={onCloseNavbar}
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
        onClick={onCloseNavbar}
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
    hasNlqAccess,
    onCloseNavbar,
    buildQuestion,
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
