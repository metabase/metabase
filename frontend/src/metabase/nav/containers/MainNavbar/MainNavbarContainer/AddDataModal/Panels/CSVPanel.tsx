import { match } from "ts-pattern";
import { t } from "ttag";

import {
  StorageSetupErrorView,
  StorageSetupView,
} from "metabase/common/components/upsells/StoragePurchaseModal";
import * as Urls from "metabase/urls";

import { useCsvPanelState } from "../csv-panel-state";

import {
  CSVPanelEmptyState,
  CSVStorageNotProvisionedEmptyState,
  PanelLoadingState,
} from "./AddDataModalEmptyStates";
import { CSVUpload } from "./CSVUpload";

interface CSVPanelProps {
  onCloseAddDataModal: () => void;
}

export const CSVPanel = ({ onCloseAddDataModal }: CSVPanelProps) => {
  const state = useCsvPanelState();

  return match(state)
    .with({ type: "loading" }, () => <PanelLoadingState />)
    .with({ type: "provisioning-storage" }, () => <StorageSetupView />)
    .with({ type: "storage-setup-failed" }, () => <StorageSetupErrorView />)
    .with({ type: "storage-not-provisioned" }, () => (
      <CSVStorageNotProvisionedEmptyState />
    ))
    .with({ type: "ask-admin" }, () => (
      <CSVPanelEmptyState contactAdminReason="enable-csv-upload" />
    ))
    .with({ type: "no-upload-permission" }, () => (
      <CSVPanelEmptyState contactAdminReason="obtain-csv-upload-permission" />
    ))
    .with({ type: "needs-uploads-setup" }, ({ canOfferStorage }) => (
      <CSVPanelEmptyState
        ctaLink={{
          text: t`Enable uploads`,
          to: Urls.uploadsSettings(),
        }}
        canOfferStorage={canOfferStorage}
      />
    ))
    .with({ type: "ready" }, () => (
      <CSVUpload onCloseAddDataModal={onCloseAddDataModal} />
    ))
    .exhaustive();
};
