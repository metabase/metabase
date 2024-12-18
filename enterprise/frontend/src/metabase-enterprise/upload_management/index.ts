import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { GSheetManagement } from "../google_sheets";

import { UploadManagementTable } from "./UploadManagementTable";

if (hasPremiumFeature("upload_management")) {
  PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable = UploadManagementTable;
}

//FIXME: if(hasPremiumFeature("hosting") && hasPremiumFeature("attached_dwh")) {
if (hasPremiumFeature("upload_management")) {
  PLUGIN_UPLOAD_MANAGEMENT.GSheetManagement = GSheetManagement;
}
