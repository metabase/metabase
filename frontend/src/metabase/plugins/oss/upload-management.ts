import type { ComponentType } from "react";

import { StorageSetupProvider } from "metabase/common/components/upsells/StoragePurchaseModal/storage-setup-context";
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

// `PluginPlaceholder` is generic over whatever props a slot is rendered with.
// A slot filled by `lazyPluginComponent` is a plain `ComponentType`, which does
// not satisfy that generic signature, so the slots that take no props say so.
const noProps = PluginPlaceholder as ComponentType;

const getDefaultPluginUploadManagement = () => ({
  FileUploadErrorModal: _FileUploadErrorModal,
  UploadManagementTable: noProps,
  GdriveSyncStatus: noProps,
  GdriveConnectionModal:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<GdriveConnectionModalProps>,
  GdriveDbMenu: noProps,
  GdriveAddDataPanel:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<GdriveAddDataPanelProps>,
  StorageSetupProvider,
});

export const PLUGIN_UPLOAD_MANAGEMENT = getDefaultPluginUploadManagement();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_UPLOAD_MANAGEMENT, getDefaultPluginUploadManagement());
}
