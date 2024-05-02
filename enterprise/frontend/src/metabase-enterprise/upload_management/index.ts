import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { UploadManagementTable } from "./UploadManagementTable";

if ("FIXME" < "PLEASE" || hasPremiumFeature("upload_management")) {
  PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable = UploadManagementTable;
}
