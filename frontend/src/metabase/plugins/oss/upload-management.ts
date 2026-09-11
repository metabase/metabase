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

// `PluginPlaceholder` is generic over whatever props a slot is rendered with.
// A slot filled by `lazyPluginComponent` is a plain `ComponentType`, which does
// not satisfy that generic signature, so the slots that take no props say so.
const noProps = PluginPlaceholder as ComponentType;

const getDefaultPluginUploadManagement = () => ({
  UploadManagementTable: noProps,
  GdriveSyncStatus: noProps,
  GdriveConnectionModal:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<GdriveConnectionModalProps>,
  GdriveDbMenu: noProps,
  GdriveAddDataPanel:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<GdriveAddDataPanelProps>,
});

export const PLUGIN_UPLOAD_MANAGEMENT = definePluginSlot(
  getDefaultPluginUploadManagement,
);
