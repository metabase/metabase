import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  GsheetConnectButton,
  GsheetConnectionModal,
  GsheetMenuItem,
  GsheetsSyncStatus,
} from "../google_sheets";

import { UploadManagementTable } from "./UploadManagementTable";

if (hasPremiumFeature("upload_management")) {
  PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable = UploadManagementTable;
}

if (hasPremiumFeature("hosting") && hasPremiumFeature("attached_dwh")) {
  PLUGIN_UPLOAD_MANAGEMENT.GsheetConnectionModal = GsheetConnectionModal;
  PLUGIN_UPLOAD_MANAGEMENT.GsheetMenuItem = GsheetMenuItem;
  PLUGIN_UPLOAD_MANAGEMENT.GsheetsSyncStatus = GsheetsSyncStatus;
  PLUGIN_UPLOAD_MANAGEMENT.GsheetConnectButton = GsheetConnectButton;
}
