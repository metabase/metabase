import { EmbeddingThemeListingApp } from "metabase/admin/embedding/components/ThemeListing";
import { UpsellEmbeddingTheme } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_WHITELABEL } from "metabase/plugins";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

/**
 * The embedding theme editor plus the appearance settings that show up inside
 * an embed. One tab, not two -- there is no separate Themes tab in the design.
 *
 * Gated as a whole. The two halves are technically gated on different features
 * -- themes on `embedding_simple`, the appearance settings on `whitelabel` --
 * but in practice they arrive together, so a partial state is not worth
 * building.
 */
export function EmbeddingHubAppearancePage() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  if (!hasSimpleEmbedding) {
    return <UpsellEmbeddingTheme source="embedding-hub-appearance" />;
  }

  return (
    <Stack gap="xl">
      <EmbeddingThemeListingApp basePath={Urls.embeddingHubAppearance()} />

      <PLUGIN_WHITELABEL.EmbeddedAppearanceSettings />
    </Stack>
  );
}
