import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellUploads } from "metabase/admin/upsells";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Box, Flex } from "metabase/ui";

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
          <UpsellUploads location="settings-uploads" />
        </Box>
      </Flex>
    </SettingsPageWrapper>
  );
}
