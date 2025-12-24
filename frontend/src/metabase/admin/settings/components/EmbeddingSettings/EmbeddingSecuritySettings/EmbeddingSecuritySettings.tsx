import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";

import { CorsInputWidget } from "./CorsInputWidget";
import { SameSiteSelectWidget } from "./SameSiteSelectWidget";

export function EmbeddingSecuritySettings() {
  return (
    <SettingsPageWrapper title={t`Security`}>
      <SettingsSection>
        <CorsInputWidget />
      </SettingsSection>

      <SettingsSection>
        <SameSiteSelectWidget />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
