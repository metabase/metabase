import { t } from "ttag";

import { useDeleteThemeFlow } from "metabase/admin/embedding/hooks";
import { UpsellEmbeddingTheme } from "metabase/admin/upsells";
import {
  useCopyEmbeddingThemeMutation,
  useListEmbeddingThemesQuery,
} from "metabase/api/embedding-theme";
import { useHasTokenFeature, useToast } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import { Loader, SimpleGrid, Stack } from "metabase/ui";

import { EmbeddingThemeCard } from "./EmbeddingThemeCard";
import { NewThemeCard } from "./NewThemeCard";

const ADMIN_THEMES_BASE_PATH = "/admin/embedding/themes";

type EmbeddingThemeListingAppProps = {
  /** Where the theme editor lives, so the same listing works under the embedding hub. */
  basePath?: string;
};

export function EmbeddingThemeListingApp({
  basePath = ADMIN_THEMES_BASE_PATH,
}: EmbeddingThemeListingAppProps = {}) {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  if (!hasSimpleEmbedding) {
    return <UpsellEmbeddingTheme source="embedding-themes" />;
  }

  return <EmbeddingThemeListingAppInner basePath={basePath} />;
}

function EmbeddingThemeListingAppInner({ basePath }: { basePath: string }) {
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

  // The heading belongs to the page, which titles itself "Appearance" and puts
  // the grid under a "Themes" section. No `mx="auto"` here either: as a flex
  // child, auto side margins override `align-items: stretch` and shrink the
  // grid to its content, which squashes the fixed-height cards into columns.
  return (
    <Stack gap="xl" w="100%">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
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
