import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import {
  EmbeddingMethodSettings,
  EmbeddingSecurityWidgets,
  SharedCombinedEmbeddingSettings,
} from "metabase/admin/settings/components/EmbeddingSettings";

/**
 * Security absorbs the standalone Guest embeds page: the design has no
 * separate "Enable guest embeds" screen.
 *
 * The three embedding-method toggles ship unmerged. Merging them into one
 * switch is the design, but it carries two unanswered questions -- what a
 * merged switch reads on an instance already in a mixed state, and which of
 * two consent moments survives -- and neither is a property of relocating the
 * settings. Merging is a follow-up on this tab.
 */
export function EmbeddingHubSecurityPage() {
  return (
    <SettingsPageWrapper title={t`Security`}>
      <EmbeddingMethodSettings />

      <EmbeddingSecurityWidgets />

      <SharedCombinedEmbeddingSettings />
    </SettingsPageWrapper>
  );
}
