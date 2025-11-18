import type { ComponentType } from "react";

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

export const PLUGIN_UPLOAD_MANAGEMENT = {
  FileUploadErrorModal: _FileUploadErrorModal,
  UploadManagementTable: PluginPlaceholder,
  GdriveSyncStatus: PluginPlaceholder,
  GdriveConnectionModal:
    PluginPlaceholder as ComponentType<GdriveConnectionModalProps>,
  GdriveDbMenu: PluginPlaceholder,
  GdriveAddDataPanel:
    PluginPlaceholder as ComponentType<GdriveAddDataPanelProps>,
};
