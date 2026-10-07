import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import CreateCollectionModal from "metabase/common/collections/containers/CreateCollectionModal";
import type {
  EntityPickerOptions,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import { useNavigate } from "metabase/router";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId, Dashboard } from "metabase-types/api";

// Only the Library › Dashboards folder (and its subfolders) can be picked
const PICKER_OPTIONS: EntityPickerOptions = {
  hasLibrary: true,
  hasRootCollection: false,
  hasPersonalCollections: false,
  hasRecents: false,
  hasSearch: false,
  hasConfirmButtons: true,
  canCreateCollections: true,
};

const isHiddenPickerItem = (item: OmniPickerItem) =>
  item.model === "collection" &&
  (item.type === "library-data" || item.type === "library-metrics");

export function LibraryDashboardsCreateMenu({
  rootCollectionId,
}: {
  rootCollectionId: CollectionId;
}) {
  const [
    isDashboardModalOpen,
    { open: openDashboardModal, close: closeDashboardModal },
  ] = useDisclosure(false);
  const [
    isCollectionModalOpen,
    { open: openCollectionModal, close: closeCollectionModal },
  ] = useDisclosure(false);
  const navigate = useNavigate();

  // Open the new dashboard in the editor; saving or canceling there brings
  // the user to its Data Studio page
  const handleDashboardCreated = (dashboard: Dashboard) => {
    closeDashboardModal();
    navigate(Urls.dashboard(dashboard, { editMode: true }), {
      state: { returnTo: Urls.dataStudioLibraryDashboard(dashboard.id) },
    });
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button size="lg" leftSection={<Icon name="add" />}>{t`New`}</Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<FixedSizeIcon name="dashboard" />}
            onClick={openDashboardModal}
          >
            {t`Dashboard`}
          </Menu.Item>
          <Menu.Item
            leftSection={<FixedSizeIcon name="folder" />}
            onClick={openCollectionModal}
          >
            {t`Folder`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {isDashboardModalOpen && (
        <CreateDashboardModal
          opened
          collectionId={rootCollectionId}
          collectionPickerModalProps={{
            options: PICKER_OPTIONS,
            isHiddenItem: isHiddenPickerItem,
          }}
          onCreate={handleDashboardCreated}
          onClose={closeDashboardModal}
        />
      )}
      {isCollectionModalOpen && (
        <CreateCollectionModal
          initialCollectionId={rootCollectionId}
          pickerOptions={PICKER_OPTIONS}
          isHiddenPickerItem={isHiddenPickerItem}
          showAuthorityLevelPicker={false}
          shouldNavigateOnCreate={false}
          onClose={closeCollectionModal}
        />
      )}
    </>
  );
}
