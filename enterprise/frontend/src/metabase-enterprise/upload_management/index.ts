import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  FileUploadErrorModal,
  GdriveAddDataPanel,
  GdriveConnectionModal,
  GdriveDbMenu,
  GdriveSyncStatus,
} from "../google_drive";

import { UploadManagementTable } from "./UploadManagementTable";

/**
 * Initialize upload_management plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("upload_management")) {
    PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable = UploadManagementTable;
  }

  if (hasPremiumFeature("hosting")) {
    // The reason we're showing this panel even to instances without the dwh
    // is because we want to show them the storage upsell.
    PLUGIN_UPLOAD_MANAGEMENT.GdriveAddDataPanel = GdriveAddDataPanel;
  }

  if (hasPremiumFeature("hosting") && hasPremiumFeature("attached_dwh")) {
    PLUGIN_UPLOAD_MANAGEMENT.FileUploadErrorModal = FileUploadErrorModal;
    PLUGIN_UPLOAD_MANAGEMENT.GdriveConnectionModal = GdriveConnectionModal;
    PLUGIN_UPLOAD_MANAGEMENT.GdriveSyncStatus = GdriveSyncStatus;
    PLUGIN_UPLOAD_MANAGEMENT.GdriveDbMenu = GdriveDbMenu;
  }
}
