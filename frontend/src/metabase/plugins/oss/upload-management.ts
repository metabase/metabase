import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import { definePluginSlot } from "../slot";

type GdriveConnectionModalProps = {
  isModalOpen: boolean;
  onClose: () => void;
  reconnect: boolean;
};

type GdriveAddDataPanelProps = {
  onAddDataModalClose: () => void;
};

const getDefaultPluginUploadManagement = () => ({
  UploadManagementTable: PluginPlaceholder,
  GdriveSyncStatus: PluginPlaceholder,
  GdriveConnectionModal:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<GdriveConnectionModalProps>,
  GdriveDbMenu: PluginPlaceholder,
  GdriveAddDataPanel:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<GdriveAddDataPanelProps>,
});

export const PLUGIN_UPLOAD_MANAGEMENT = definePluginSlot(
  getDefaultPluginUploadManagement,
);
