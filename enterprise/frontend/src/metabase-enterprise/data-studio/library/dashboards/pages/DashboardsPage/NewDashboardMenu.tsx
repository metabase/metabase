import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import type { CollectionId, CollectionNamespace } from "metabase-types/api";

import { LIBRARY_COLLECTION_PICKER_OPTIONS } from "../../../constants";

const LIBRARY_COLLECTION_NAMESPACES: CollectionNamespace[] = [null];

type NewDashboardMenuProps = {
  dashboardCollectionId: CollectionId;
  onNewDashboardClick: () => void;
};

export function NewDashboardMenu({
  dashboardCollectionId,
  onNewDashboardClick,
}: NewDashboardMenuProps) {
  const dispatch = useDispatch();

  const handleNewFolderClick = () =>
    dispatch(
      setOpenModalWithProps({
        id: "collection",
        props: {
          initialCollectionId: dashboardCollectionId,
          namespaces: LIBRARY_COLLECTION_NAMESPACES,
          pickerOptions: LIBRARY_COLLECTION_PICKER_OPTIONS,
          showAuthorityLevelPicker: false,
        },
      }),
    );

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="lg" leftSection={<Icon name="add" />}>{t`New`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FixedSizeIcon name="dashboard" />}
          onClick={onNewDashboardClick}
        >
          {t`Dashboard`}
        </Menu.Item>
        <Menu.Item
          leftSection={<FixedSizeIcon name="folder" />}
          onClick={handleNewFolderClick}
        >
          {t`Folder`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
