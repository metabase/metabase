import { t } from "ttag";

import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Flex, Stack, Title } from "metabase/ui";

import { SettingsSection } from "../SettingsSection";
import { UploadSettingsForm } from "../UploadSettings/UploadSettingsForm";

export function UploadSettingsPage() {
  return (
    <Stack>
      <Title order={1}>{t`Uploads`}</Title>
      <SettingsSection>
        <Flex justify="space-between" align="flex-start" gap="md">
          <UploadSettingsForm />
          <UpsellUploads source="settings-uploads" />
        </Flex>
        <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
      </SettingsSection>
    </Stack>
  );
}
