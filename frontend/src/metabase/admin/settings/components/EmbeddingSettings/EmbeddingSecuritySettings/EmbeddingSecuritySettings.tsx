import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useHasTokenFeature } from "metabase/common/hooks";

import { CorsInputWidget } from "./CorsInputWidget";
import { SameSiteSelectWidget } from "./SameSiteSelectWidget";

/** Composed by the embedding hub's Security tab under its own page wrapper. */
export function EmbeddingSecurityWidgets() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  return (
    <>
      <SettingsSection>
        <CorsInputWidget />
      </SettingsSection>

      {/* SameSite governs the metabase.SESSION cookie, and guest embeds never
          set one (src/metabase/request/cookies.clj:71-81). Guest is the only
          method below the paywall, so the setting is inert there — showing it
          invites an admin to change a value that cannot affect their embeds. */}
      {hasSimpleEmbedding && (
        <SettingsSection>
          <SameSiteSelectWidget />
        </SettingsSection>
      )}
    </>
  );
}

/**
 * The admin embedding section's Security page, unchanged. EMB-1526 deletes it
 * along with the rest of that section; until then both surfaces render.
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
