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
  return (
    <>
      {uploadsEnabled &&
        (canUpload ? (
          <CSVUpload onCloseAddDataModal={onCloseAddDataModal} />
        ) : (
          <CSVPanelEmptyState contactAdminReason="obtain-csv-upload-permission" />
        ))}

      {!uploadsEnabled &&
        (canManageUploads ? (
          <CSVPanelEmptyState
            ctaLink={{
              text: t`Enable uploads`,
              to: Urls.uploadsSettings(),
            }}
          />
        ) : (
          <CSVPanelEmptyState contactAdminReason="enable-csv-upload" />
        ))}
    </>
  );
};
