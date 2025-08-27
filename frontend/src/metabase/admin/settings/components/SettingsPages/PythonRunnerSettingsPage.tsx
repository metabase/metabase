import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";

import { AdminSettingInput } from "../widgets/AdminSettingInput";

export function PythonRunnerSettingsPage() {
  const hasTransformsFeature = useHasTokenFeature("transforms");

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!hasTransformsFeature) {
    return (
      <SettingsPageWrapper title={t`Python Runner`}>
        <SettingsSection>
          <div className="text-medium">
            {t`Python Runner configuration requires the transforms feature.`}
          </div>
        </SettingsSection>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper title={t`Python Runner`}>
      <SettingsSection title={t`Service Configuration`}>
        <AdminSettingInput
          name="python-runner-base-url"
          title={t`Base URL`}
          description={t`The base URL for the Python runner service. When Python runner is deployed as a separate service, update this URL.`}
          placeholder="http://localhost:3000"
          inputType="text"
        />
        <AdminSettingInput
          name="python-runner-api-key"
          title={t`API Key`}
          description={t`API key for authenticating with the Python runner service. You can create one in Authentication -> API Keys`}
          placeholder={t`Enter API key`}
          inputType="password"
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
