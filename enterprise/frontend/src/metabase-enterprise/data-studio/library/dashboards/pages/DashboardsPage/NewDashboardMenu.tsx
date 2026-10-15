import { t } from "ttag";

import { openNewCollectionModal } from "metabase/data-studio/common/utils";
import { useDispatch } from "metabase/redux";
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

  const handleNewCollectionClick = () =>
    dispatch(
      openNewCollectionModal({
        initialCollectionId: dashboardCollectionId,
        namespaces: LIBRARY_COLLECTION_NAMESPACES,
        pickerOptions: LIBRARY_COLLECTION_PICKER_OPTIONS,
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
          onClick={handleNewCollectionClick}
        >
          {t`Collection`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
