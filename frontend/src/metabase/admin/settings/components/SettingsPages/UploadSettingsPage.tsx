import { t } from "ttag";

import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components/SettingsSection";
import { Box, Flex } from "metabase/ui";

import { UploadSettingsForm } from "../UploadSettings/UploadSettingsForm";

export function UploadSettingsPage() {
  return (
    <SettingsPageWrapper title={t`Uploads`}>
      <Flex justify="space-between" gap="xl">
        <SettingsSection>
          <UploadSettingsForm />
          <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
        </SettingsSection>
        <Box>
          <UpsellUploads location="settings-uploads" />
        </Box>
      </Flex>
    </SettingsPageWrapper>
  );
}
