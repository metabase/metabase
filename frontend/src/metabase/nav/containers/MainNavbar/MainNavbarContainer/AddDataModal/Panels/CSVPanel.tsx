import { t } from "ttag";

import { UpsellStorage } from "metabase/admin/upsells";
import * as Urls from "metabase/lib/urls";

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
  const showObtainPermissionPrompt = uploadsEnabled && !canUpload;

  const showEnableUploadsCTA = !uploadsEnabled && canManageUploads;
  const showEnableUploadsPrompt = !uploadsEnabled && !canManageUploads;

  if (showEnableUploadsPrompt) {
    return <CSVPanelEmptyState contactAdminReason="enable-csv-upload" />;
  }

  if (showObtainPermissionPrompt) {
    return (
      <CSVPanelEmptyState contactAdminReason="obtain-csv-upload-permission" />
    );
  }

  if (showEnableUploadsCTA) {
    return (
      <CSVPanelEmptyState
        ctaLink={{
          text: t`Enable uploads`,
          to: Urls.uploadsSettings(),
        }}
        upsell={<UpsellStorage location="add-data-modal-csv" />}
      />
    );
  }

  return <CSVUpload onCloseAddDataModal={onCloseAddDataModal} />;
};
