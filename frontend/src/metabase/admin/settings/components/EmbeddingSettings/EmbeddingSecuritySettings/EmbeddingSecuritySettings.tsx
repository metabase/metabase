import { SettingsSection } from "metabase/admin/components/SettingsSection";
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
