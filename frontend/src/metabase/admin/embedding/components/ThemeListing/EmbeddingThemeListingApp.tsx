import { t } from "ttag";

import { useDeleteThemeFlow } from "metabase/admin/embedding/hooks";
import { UpsellEmbeddingTheme } from "metabase/admin/upsells";
import {
  useCopyEmbeddingThemeMutation,
  useListEmbeddingThemesQuery,
} from "metabase/api/embedding-theme";
import { useHasTokenFeature, useToast } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import { Loader, SimpleGrid, Stack, Text, Title } from "metabase/ui";

import { EmbeddingThemeCard } from "./EmbeddingThemeCard";
import { NewThemeCard } from "./NewThemeCard";

const ADMIN_THEMES_BASE_PATH = "/admin/embedding/themes";

type EmbeddingThemeListingAppProps = {
  /** Where the theme editor lives, so the same listing works under the embedding hub. */
  basePath?: string;
  /**
   * Whether the listing supplies its own page heading. Admin's route mounts it
   * as the whole page, so it does; the embedding hub's Appearance page titles
   * itself and puts the grid under a "Themes" section of its own.
   */
  showHeading?: boolean;
};

export function EmbeddingThemeListingApp({
  basePath = ADMIN_THEMES_BASE_PATH,
  showHeading = true,
}: EmbeddingThemeListingAppProps = {}) {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  if (!hasSimpleEmbedding) {
    return <UpsellEmbeddingTheme source="embedding-themes" />;
  }

  return (
    <EmbeddingThemeListingAppInner
      basePath={basePath}
      showHeading={showHeading}
    />
  );
}

function EmbeddingThemeListingAppInner({
  basePath,
  showHeading,
}: {
  basePath: string;
  showHeading: boolean;
}) {
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

  // Without the heading the listing is a bare grid, which is what the hub's
  // Appearance page wants. No `mx="auto"` there either: as a flex child, auto
  // side margins override `align-items: stretch` and shrink the grid to its
  // content, which squashes the fixed-height cards into columns.
  return (
    <Stack
      gap="xxl"
      w="100%"
      mx={showHeading ? "auto" : undefined}
      maw={showHeading ? 1200 : undefined}
    >
      {showHeading && (
        <Stack gap="xxs">
          <Title order={1}>{t`Themes`}</Title>
          <Text c="text-secondary">
            {t`Create and edit themes to reuse across multiple embeds.`}
          </Text>
        </Stack>
      )}

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
