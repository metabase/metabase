import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { UpsellEmbeddingTheme } from "metabase/admin/upsells";
import {
  useCopyEmbeddingThemeMutation,
  useDeleteEmbeddingThemeMutation,
  useListEmbeddingThemesQuery,
} from "metabase/api/embedding-theme";
import { useHasTokenFeature, useToast } from "metabase/common/hooks";
import { Loader, SimpleGrid, Stack, Text, Title } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";

import { DeleteThemeModal } from "./DeleteThemeModal";
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
  const dispatch = useDispatch();
  const { data: themes, isLoading } = useListEmbeddingThemesQuery();
  const [duplicateTheme] = useCopyEmbeddingThemeMutation();
  const [deleteTheme] = useDeleteEmbeddingThemeMutation();
  const [sendToast] = useToast();

  const [themeToDelete, setThemeToDelete] = useState<number | null>(null);

  const handleCreateTheme = () => {
    dispatch(push(`/admin/embedding/themes/new`));
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

  const handleDeleteTheme = async () => {
    if (!themeToDelete) {
      return;
    }

    try {
      await deleteTheme(themeToDelete);
      sendToast({ message: t`Theme deleted successfully`, icon: "check" });
      setThemeToDelete(null);
    } catch (error) {
      console.error("Failed to delete theme:", error);
      sendToast({ message: t`Failed to delete theme`, icon: "warning" });
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
    <Stack mx="auto" gap="xl" maw={1200}>
      <Stack gap="xs">
        <Title order={1}>{t`Themes`}</Title>
        <Text c="text-secondary">
          {t`Configure themes for Embedded Analytics JS and SDK for React`}
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {themes?.map((theme) => (
          <EmbeddingThemeCard
            key={theme.id}
            theme={theme}
            onEdit={() => dispatch(push(`/admin/embedding/themes/${theme.id}`))}
            onDuplicate={() => handleDuplicateTheme(theme.id)}
            onDelete={() => setThemeToDelete(theme.id)}
          />
        ))}
        <NewThemeCard onClick={handleCreateTheme} />
      </SimpleGrid>

      <DeleteThemeModal
        isOpen={themeToDelete !== null}
        onCancel={() => setThemeToDelete(null)}
        onDelete={handleDeleteTheme}
      />
    </Stack>
  );
}
