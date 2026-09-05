import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";

import { CorsInputWidget } from "./CorsInputWidget";
import { SameSiteSelectWidget } from "./SameSiteSelectWidget";

/**
 * The admin embedding section's Security page, unchanged. EMB-1526 deletes it
 * along with the rest of that section; until then it and the embedding hub's
 * Security tab both render these widgets.
 */
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
