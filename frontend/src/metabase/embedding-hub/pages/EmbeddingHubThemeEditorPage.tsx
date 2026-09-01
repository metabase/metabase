import { useHasTokenFeature } from "metabase/common/hooks";
import { EmbeddingThemeEditorApp } from "metabase/embedding/themes/components/ThemeEditor";
import { Navigate } from "metabase/router";
import * as Urls from "metabase/urls";

/**
 * The editor is its own route rather than a child of the Appearance page, so it
 * repeats that page's `embedding_simple` gate -- without it a deep link opens
 * the editor on a plan that cannot use it. Sending them to Appearance shows the
 * upsell that page already owns.
 */
export function EmbeddingHubThemeEditorPage() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  if (!hasSimpleEmbedding) {
    return <Navigate to={Urls.embeddingHubAppearance()} replace />;
  }

  return <EmbeddingThemeEditorApp basePath={Urls.embeddingHubAppearance()} />;
}
