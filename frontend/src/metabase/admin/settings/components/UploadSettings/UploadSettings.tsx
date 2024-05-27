import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";

import { UploadSettingsForm } from "./UploadSettingsForm";

export const UploadSettings = () => {
  return (
    <>
      <UploadSettingsForm />
      <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
    </>
  );
};
