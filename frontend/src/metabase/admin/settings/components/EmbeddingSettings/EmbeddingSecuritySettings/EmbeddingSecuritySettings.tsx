import { SettingsSection } from "metabase/admin/components/SettingsSection";

import { CorsInputWidget } from "./CorsInputWidget";
import { SameSiteSelectWidget } from "./SameSiteSelectWidget";

/** Composed by the embedding hub's Security tab under its own page wrapper. */
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
