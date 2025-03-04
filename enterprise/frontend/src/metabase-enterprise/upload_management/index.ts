import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { UploadManagementTable } from "./UploadManagementTable";
export const activate = () => {
if (hasPremiumFeature("upload_management")) {
  PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable = UploadManagementTable;
}

};
