import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Flex } from "metabase/ui";

export const UploadSettings = () => {
  return (
    <>
      <Flex justify="space-between" align="flex-start" gap="md">
        <PLUGIN_UPLOAD_MANAGEMENT.UploadSettings />
        <UpsellUploads source="settings-uploads" />
      </Flex>
      <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
    </>
  );
};
