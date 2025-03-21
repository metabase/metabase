import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  GdriveConnectionModal,
  GdriveDbMenu,
  GdriveSidebarMenuItem,
  GdriveSyncStatus,
} from "../google_drive";

import { UploadManagementTable } from "./UploadManagementTable";

if (hasPremiumFeature("upload_management")) {
  PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable = UploadManagementTable;
}

if (hasPremiumFeature("hosting") && hasPremiumFeature("attached_dwh")) {
  PLUGIN_UPLOAD_MANAGEMENT.GdriveConnectionModal = GdriveConnectionModal;
  PLUGIN_UPLOAD_MANAGEMENT.GdriveSidebarMenuItem = GdriveSidebarMenuItem;
  PLUGIN_UPLOAD_MANAGEMENT.GdriveSyncStatus = GdriveSyncStatus;
  PLUGIN_UPLOAD_MANAGEMENT.GdriveDbMenu = GdriveDbMenu;
}
