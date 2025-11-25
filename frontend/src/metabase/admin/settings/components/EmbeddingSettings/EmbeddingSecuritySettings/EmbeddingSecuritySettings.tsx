import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";

import { SameSiteSelectWidget } from "./SameSiteSelectWidget";

export function EmbeddingSecuritySettings() {
  return (
    <SettingsPageWrapper title={t`Security`}>
      <SettingsSection>
        <SameSiteSelectWidget />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
