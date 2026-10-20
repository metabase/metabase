import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { getUserCanWriteToCollections } from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModal } from "metabase/redux/ui";
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

export const NewItemMenuView = ({ trigger }: NewItemMenuProps) => {
  const dispatch = useDispatch();
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);

  const menuItems = useMemo(() => {
    const items = [
      <Menu.Item
        key="document"
        component={ForwardRefLink}
        to="/document/new"
        leftSection={<Icon name="document" />}
      >
        {t`Notebook`}
      </Menu.Item>,
    ];

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
        <Menu.Item
          key="data-app"
          component={ForwardRefLink}
          to={Urls.newDataAppGuide()}
          leftSection={<Icon name="app" />}
        >
          {t`Data app`}
        </Menu.Item>,
      );
    }

    return items;
  }, [dispatch, canWriteToCollections]);

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
