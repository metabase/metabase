import { t } from "ttag";

import {
  AdminSettingInput,
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";

import { MonitorRelayStatusSection } from "./MonitorRelayStatusSection";

export function MonitorRelaySettingsPage() {
  return (
    <SettingsPageWrapper
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- "Metabase Monitor" is a product name, not the instance name
      title={t`Metabase Monitor`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- "Metabase Monitor" is a product name, not the instance name
      description={t`Metabase Monitor watches for data exfiltration. This instance sends it the rows of its application database.`}
    >
      <SettingsSection>
        <AdminSettingInput
          name="metabase-monitor-url"
          title={t`Ingestion URL`}
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- "Metabase Monitor" is a product name, not the instance name
          description={t`Paste the URL that Metabase Monitor gave when you registered this instance. Clear it to stop sending.`}
          inputType="password"
        />
      </SettingsSection>
      <MonitorRelayStatusSection />
    </SettingsPageWrapper>
  );
}
