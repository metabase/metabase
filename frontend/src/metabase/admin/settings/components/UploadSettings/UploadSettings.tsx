import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Flex } from "metabase/ui";

import { UploadSettingsForm } from "./UploadSettingsForm";

export const UploadSettings = () => {
  return (
    <>
      <Flex justify="space-between" align="flex-start" gap="md">
        <UploadSettingsForm />
        <UpsellUploads source="settings-uploads" />
      </Flex>
      <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
    </>
  );
};
