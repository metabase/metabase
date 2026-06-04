import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import { _FileUploadErrorModal } from "metabase/status/components/FileUploadStatusLarge/FileUploadErrorModal";

type FileUploadErrorModalProps = {
  onClose: () => void;
  fileName?: string;
  children: string;
  opened?: boolean;
};

type GdriveConnectionModalProps = {
  isModalOpen: boolean;
  onClose: () => void;
  reconnect: boolean;
};

type GdriveAddDataPanelProps = {
  onAddDataModalClose: () => void;
};

type PluginUploadManagement = {
  FileUploadErrorModal: ComponentType<FileUploadErrorModalProps>;
  UploadManagementTable: ComponentType;
  GdriveSyncStatus: ComponentType;
  GdriveConnectionModal: ComponentType<GdriveConnectionModalProps>;
  GdriveDbMenu: ComponentType;
  GdriveAddDataPanel: ComponentType<GdriveAddDataPanelProps>;
};

const getDefaultPluginUploadManagement = (): PluginUploadManagement => ({
  FileUploadErrorModal: ({ opened = true, ...props }) =>
    _FileUploadErrorModal({ ...props, opened }),
  UploadManagementTable: PluginPlaceholder,
  GdriveSyncStatus: PluginPlaceholder,
  GdriveConnectionModal: PluginPlaceholder<GdriveConnectionModalProps>,
  GdriveDbMenu: PluginPlaceholder,
  GdriveAddDataPanel: PluginPlaceholder<GdriveAddDataPanelProps>,
});

export const PLUGIN_UPLOAD_MANAGEMENT = getDefaultPluginUploadManagement();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_UPLOAD_MANAGEMENT, getDefaultPluginUploadManagement());
}
