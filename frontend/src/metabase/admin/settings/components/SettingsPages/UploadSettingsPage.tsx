import { t } from "ttag";

import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Box, Flex } from "metabase/ui";

import { SettingsPageWrapper, SettingsSection } from "../SettingsSection";
import { UploadSettingsForm } from "../UploadSettings/UploadSettingsForm";

export function UploadSettingsPage() {
  return (
    <SettingsPageWrapper title={t`Uploads`}>
      <Flex justify="space-between" gap="lg">
        <SettingsSection>
          <UploadSettingsForm />
          <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
        </SettingsSection>
        <Box>
          <UpsellUploads source="settings-uploads" />
        </Box>
      </Flex>
    </SettingsPageWrapper>
  );
}
