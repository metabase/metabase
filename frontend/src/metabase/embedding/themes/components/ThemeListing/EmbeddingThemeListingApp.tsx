import { t } from "ttag";

import {
  useCopyEmbeddingThemeMutation,
  useListEmbeddingThemesQuery,
} from "metabase/api/embedding-theme";
import { useToast } from "metabase/common/hooks";
import { useDeleteThemeFlow } from "metabase/embedding/themes/hooks";
import { useNavigate } from "metabase/router";
import { Loader, SimpleGrid, Stack } from "metabase/ui";

import { EmbeddingThemeCard } from "./EmbeddingThemeCard";
import { NewThemeCard } from "./NewThemeCard";

type EmbeddingThemeListingAppProps = {
  /** Where the theme editor lives, so the listing knows where to link to. */
  basePath: string;
};

/**
 * The caller is responsible for gating this on the `embedding_simple` token
 * feature -- the embedding hub's Appearance page does, showing its own
 * upsell instead of mounting this component at all when the feature is off.
 */
export function EmbeddingThemeListingApp({
  basePath,
}: EmbeddingThemeListingAppProps) {
  const navigate = useNavigate();
  const { data: themes, isLoading } = useListEmbeddingThemesQuery();
  const [duplicateTheme] = useCopyEmbeddingThemeMutation();
  const [sendToast] = useToast();
  const { requestDelete, modal: deleteModal } = useDeleteThemeFlow();

  const handleCreateTheme = () => {
    navigate(`${basePath}/new`);
  };

  const handleDuplicateTheme = async (themeId: number) => {
    try {
      await duplicateTheme(themeId);
      sendToast({ message: t`Theme duplicated successfully`, icon: "check" });
    } catch (error) {
      console.error("Failed to duplicate theme:", error);
      sendToast({ message: t`Failed to duplicate theme`, icon: "warning" });
    }
  };

  if (isLoading) {
    return (
      <Stack align="center" justify="center" h={400}>
        <Loader />
      </Stack>
    );
  }

  // No `mx="auto"`: as a flex child, auto side margins override
  // `align-items: stretch` and shrink the grid to its content, which squashes
  // the fixed-height cards into columns.
  return (
    <Stack gap="xxl" w="100%">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {themes?.map((theme) => (
          <EmbeddingThemeCard
            key={theme.id}
            theme={theme}
            onEdit={() => navigate(`${basePath}/${theme.id}`)}
            onDuplicate={() => handleDuplicateTheme(theme.id)}
            onDelete={() => requestDelete(theme.id)}
          />
        ))}
        <NewThemeCard onClick={handleCreateTheme} />
      </SimpleGrid>

      {deleteModal}
    </Stack>
  );
}
