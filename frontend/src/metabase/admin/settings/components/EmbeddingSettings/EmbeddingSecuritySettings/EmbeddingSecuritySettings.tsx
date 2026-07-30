import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";

import { CorsInputWidget } from "./CorsInputWidget";
import { SameSiteSelectWidget } from "./SameSiteSelectWidget";

/** Split out so the embedding hub can compose the widgets under its own page wrapper. */
export function EmbeddingSecurityWidgets() {
  return (
    <>
      <SettingsSection>
        <CorsInputWidget />
      </SettingsSection>

      <SettingsSection>
        <SameSiteSelectWidget />
      </SettingsSection>
    </>
  );
}

export function EmbeddingSecuritySettings() {
  return (
    <SettingsPageWrapper title={t`Security`}>
      <EmbeddingSecurityWidgets />
    </SettingsPageWrapper>
  );
}
