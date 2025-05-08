import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Flex, Stack } from "metabase/ui";

import { UploadSettingsForm } from "../UploadSettings/UploadSettingsForm";

export function UploadSettingsPage() {
  return (
    <Stack gap="xl" maw="60rem" px="lg" py="sm">
      <Flex justify="space-between" align="flex-start" gap="md">
        <UploadSettingsForm />
        <UpsellUploads source="settings-uploads" />
      </Flex>
      <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
    </Stack>
  );
}
