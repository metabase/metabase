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

export function EmbeddingThemeListingApp() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  if (!hasSimpleEmbedding) {
    return <UpsellEmbeddingTheme source="embedding-themes" />;
  }

  return <EmbeddingThemeListingAppInner />;
}

function EmbeddingThemeListingAppInner() {
  const navigate = useNavigate();
  const { data: themes, isLoading } = useListEmbeddingThemesQuery();
  const [duplicateTheme] = useCopyEmbeddingThemeMutation();
  const [sendToast] = useToast();
  const { requestDelete, modal: deleteModal } = useDeleteThemeFlow();

  const handleCreateTheme = () => {
    navigate(`/admin/embedding/themes/new`);
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

  return (
    <Stack mx="auto" gap="xxl" maw={1200}>
      <Stack gap="xxs">
        <Title order={1}>{t`Themes`}</Title>
        <Text c="text-secondary">
          {t`Create and edit themes to reuse across multiple embeds.`}
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {themes?.map((theme) => (
          <EmbeddingThemeCard
            key={theme.id}
            theme={theme}
            onEdit={() => navigate(`/admin/embedding/themes/${theme.id}`)}
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
