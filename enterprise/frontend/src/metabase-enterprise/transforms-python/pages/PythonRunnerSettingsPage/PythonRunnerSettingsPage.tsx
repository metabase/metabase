import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";

export function PythonRunnerSettingsPage() {
  return (
    <SettingsPageWrapper title={t`Python Runner`}>
      <SettingsSection title={t`Service Configuration`}>
        <AdminSettingInput
          name="python-execution-server-url"
          title={t`Python Execution Server URL`}
          description={t`URL for the Python execution server that runs transform functions.`}
          placeholder="http://localhost:5001"
          inputType="text"
        />
      </SettingsSection>
      <SettingsSection title={t`S3 Storage Configuration`}>
        <AdminSettingInput
          name="python-storage-s-3-endpoint"
          title={t`S3 Endpoint`}
          description={t`S3 endpoint URL for storing Python execution artifacts.`}
          inputType="text"
        />
        <AdminSettingInput
          name="python-storage-s-3-region"
          title={t`S3 Region`}
          description={t`AWS region for S3 storage.`}
          inputType="text"
        />
        <AdminSettingInput
          name="python-storage-s-3-bucket"
          title={t`S3 Bucket`}
          description={t`S3 bucket name for storing Python execution artifacts.`}
          inputType="text"
        />
        <AdminSettingInput
          name="python-storage-s-3-access-key"
          title={t`S3 Access Key ID`}
          description={t`AWS access key ID for S3 authentication.`}
          inputType="password"
        />
        <AdminSettingInput
          name="python-storage-s-3-secret-key"
          title={t`S3 Secret Access Key`}
          description={t`AWS secret access key for S3 authentication.`}
          inputType="password"
        />
        <AdminSettingInput
          name="python-storage-s-3-container-endpoint"
          title={t`S3 Container Endpoint (Optional)`}
          description={t`Alternative S3 endpoint accessible from containers. Leave empty if same as main endpoint.`}
          inputType="text"
        />
        <AdminSettingInput
          name="python-storage-s-3-path-style-access"
          title={t`Use Path-Style Access`}
          description={t`Use path-style access for S3 requests (required for LocalStack and some S3-compatible services).`}
          inputType="boolean"
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
