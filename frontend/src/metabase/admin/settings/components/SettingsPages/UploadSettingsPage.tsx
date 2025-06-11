import { t } from "ttag";

import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Box, Flex, Stack, Title } from "metabase/ui";

import { SettingsSection } from "../SettingsSection";
import { UploadSettingsForm } from "../UploadSettings/UploadSettingsForm";

export function UploadSettingsPage() {
  return (
    <Stack>
      <Title order={1}>{t`Uploads`}</Title>
      <Flex justify="space-between" gap="lg">
        <SettingsSection>
          <UploadSettingsForm />
          <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
        </SettingsSection>
        <Box>
          <UpsellUploads source="settings-uploads" />
        </Box>
      </Flex>
    </Stack>
  );
}
