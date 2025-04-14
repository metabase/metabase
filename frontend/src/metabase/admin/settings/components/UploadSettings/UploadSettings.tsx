import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Flex } from "metabase/ui";

import { type SaveStatusRef, UploadSettingsForm } from "./UploadSettingsForm";

export const UploadSettings = ({
  saveStatusRef,
}: {
  saveStatusRef: SaveStatusRef;
}) => {
  return (
    <>
      <Flex justify="space-between" align="flex-start" gap="md">
        <UploadSettingsForm saveStatusRef={saveStatusRef} />
        <UpsellUploads source="settings-uploads" />
      </Flex>
      <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
    </>
  );
};
