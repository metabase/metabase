import type { ComponentType } from "react";

import { StorageSetupProvider } from "metabase/common/components/upsells/StoragePurchaseModal/storage-setup-context";
import { definePluginSlot } from "metabase/plugin-slots";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import { _FileUploadErrorModal } from "metabase/status/components/FileUploadStatusLarge/FileUploadErrorModal";

type GdriveConnectionModalProps = {
  isModalOpen: boolean;
  onClose: () => void;
  reconnect: boolean;
};

type GdriveAddDataPanelProps = {
  onAddDataModalClose: () => void;
};

const getDefaultPluginUploadManagement = () => ({
  FileUploadErrorModal: _FileUploadErrorModal,
  UploadManagementTable: PluginPlaceholder,
  GdriveSyncStatus: PluginPlaceholder,
  GdriveConnectionModal:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<GdriveConnectionModalProps>,
  GdriveDbMenu: PluginPlaceholder,
  GdriveAddDataPanel:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<GdriveAddDataPanelProps>,
  StorageSetupProvider,
});

export const PLUGIN_UPLOAD_MANAGEMENT = definePluginSlot(
  getDefaultPluginUploadManagement,
);
