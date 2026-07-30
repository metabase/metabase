import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import {
  EmbeddingSecurityWidgets,
  SharedCombinedEmbeddingSettings,
} from "metabase/admin/settings/components/EmbeddingSettings";

/**
 * Security absorbs the standalone Guest embeds page (item 11 of
 * 01-questions-for-roman.md): the embedding-method toggles merge into one card,
 * so there is no separate "Enable guest embeds" screen in the new design.
 */
export function EmbeddingHubSecurityPage() {
  return (
    <SettingsPageWrapper title={t`Security`}>
      <EmbeddingSecurityWidgets />

      {/* TODO (Kelvin 2026-07-31) this renders the whole guest-embeds block — toggle, secret key, and the Published embeds list — as one unit. Items 11 and 12 still decide the final shape: whether the guest toggle joins the modular and full-app toggles in a shared card (and therefore moves to Get started), where the Published embeds list goes now that its own tab disappears, and whether full-app authorized origins land next to the SDK CORS input here. */}
      <SharedCombinedEmbeddingSettings />

      {/* TODO (Kelvin 2026-07-31) the /admin/embedding index page (EmbeddingSettings) has no tab in the new design. Its embedding-method toggles belong on Get started and content translation belongs on Localization, but the version pinning card is homeless — item 7 asks Alessio where it lands, and asks about that card only, not about the rest of the page. Nothing from that page is scaffolded here on purpose. */}
    </SettingsPageWrapper>
  );
}
