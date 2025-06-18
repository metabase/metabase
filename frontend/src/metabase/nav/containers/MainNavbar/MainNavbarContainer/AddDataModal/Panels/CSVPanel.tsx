import { t } from "ttag";

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
  const showUploads = uploadsEnabled && canUpload;
  const showObtainPermissionPrompt = uploadsEnabled && !canUpload;

  const showEnableUploadsCTA = !uploadsEnabled && canManageUploads;
  const showEnableUploadsPrompt = !uploadsEnabled && !canManageUploads;

  return (
    <>
      {showUploads && <CSVUpload onCloseAddDataModal={onCloseAddDataModal} />}

      {showObtainPermissionPrompt && (
        <CSVPanelEmptyState contactAdminReason="obtain-csv-upload-permission" />
      )}

      {showEnableUploadsCTA && (
        <CSVPanelEmptyState
          ctaLink={{
            text: t`Enable uploads`,
            to: Urls.uploadsSettings(),
          }}
        />
      )}

      {showEnableUploadsPrompt && (
        <CSVPanelEmptyState contactAdminReason="enable-csv-upload" />
      )}
    </>
  );
};
