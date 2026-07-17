import { t } from "ttag";

import {
  StoragePurchaseButton,
  StorageSetupView,
  useStorageSetup,
} from "metabase/common/components/upsells/StoragePurchaseModal";
import { Center, Loader } from "metabase/ui";
import * as Urls from "metabase/urls";

import { CSVPanelEmptyState } from "./AddDataModalEmptyStates";
import { CSVUpload } from "./CSVUpload";

interface CSVPanelProps {
  canUpload: boolean;
  canManageUploads: boolean;
  onCloseAddDataModal: () => void;
  uploadsEnabled: boolean;
}

export const CSVPanel = ({
  canUpload,
  canManageUploads,
  onCloseAddDataModal,
  uploadsEnabled,
}: CSVPanelProps) => {
  const {
    isSettingUp,
    isLoadingStorageAddOn,
    canSetUpStorage,
    hasAttachedDwh,
  } = useStorageSetup();

  const showObtainPermissionPrompt = uploadsEnabled && !canUpload;
  const showEnableUploadsCTA = !uploadsEnabled && canManageUploads;
  const showEnableUploadsPrompt = !uploadsEnabled && !canManageUploads;

  if (isSettingUp) {
    return <StorageSetupView />;
  }

  if (showEnableUploadsPrompt) {
    return <CSVPanelEmptyState contactAdminReason="enable-csv-upload" />;
  }

  if (showObtainPermissionPrompt) {
    return (
      <CSVPanelEmptyState contactAdminReason="obtain-csv-upload-permission" />
    );
  }

  if (showEnableUploadsCTA) {
    if (isLoadingStorageAddOn) {
      return (
        <Center h="100%">
          <Loader />
        </Center>
      );
    }

    return (
      <CSVPanelEmptyState
        ctaLink={{
          text: t`Enable uploads`,
          to: Urls.uploadsSettings(),
        }}
        secondaryAction={
          canSetUpStorage && !hasAttachedDwh ? (
            <StoragePurchaseButton location="add-data-modal-csv" />
          ) : undefined
        }
      />
    );
  }

  return <CSVUpload onCloseAddDataModal={onCloseAddDataModal} />;
};
