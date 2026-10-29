import { t } from "ttag";

import { UpsellUploads } from "metabase/admin/upsells";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";
import { Box, Flex } from "metabase/ui";

import { UploadSettingsForm } from "../UploadSettings/UploadSettingsForm";

export function UploadSettingsPage() {
  const isAdmin = useSelector(getUserIsAdmin);
  return (
    <SettingsPageWrapper title={t`Uploads`}>
      <Flex justify="space-between" gap="xl">
        <SettingsSection>
          <UploadSettingsForm />
          <PLUGIN_UPLOAD_MANAGEMENT.UploadManagementTable />
        </SettingsSection>
        {isAdmin && (
          <Box>
            <UpsellUploads location="settings-uploads" />
          </Box>
        )}
      </Flex>
    </SettingsPageWrapper>
  );
}
