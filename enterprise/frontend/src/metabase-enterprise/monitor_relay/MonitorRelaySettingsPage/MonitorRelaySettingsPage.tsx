import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";

import { IngestionUrlSetting } from "./IngestionUrlSetting";
import { MonitorRelayStatusSection } from "./MonitorRelayStatusSection";
import { MONITOR_NAME } from "./utils";

export function MonitorRelaySettingsPage() {
  return (
    <SettingsPageWrapper
      title={MONITOR_NAME}
      description={t`${MONITOR_NAME} watches for data exfiltration. This instance sends it the rows of its application database.`}
    >
      <SettingsSection>
        <IngestionUrlSetting />
      </SettingsSection>
      <MonitorRelayStatusSection />
    </SettingsPageWrapper>
  );
}
