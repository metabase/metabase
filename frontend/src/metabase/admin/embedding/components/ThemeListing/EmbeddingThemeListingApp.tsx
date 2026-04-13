import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDefaultEmbeddingThemeSettings } from "metabase/admin/embedding/hooks";
import {
  useCopyEmbeddingThemeMutation,
  useCreateEmbeddingThemeMutation,
  useDeleteEmbeddingThemeMutation,
  useListEmbeddingThemesQuery,
} from "metabase/api/embedding-theme";
import { EmptyState } from "metabase/common/components/EmptyState";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
import { useToast } from "metabase/common/hooks";
import {
  Button,
  Flex,
  Icon,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";

import { DeleteThemeModal } from "./DeleteThemeModal";
import { EmbeddingThemeCard } from "./EmbeddingThemeCard";

export function EmbeddingThemeListingApp() {
  const dispatch = useDispatch();
  const { data: themes, isLoading } = useListEmbeddingThemesQuery();
  const [createTheme] = useCreateEmbeddingThemeMutation();
  const [duplicateTheme] = useCopyEmbeddingThemeMutation();
  const [deleteTheme] = useDeleteEmbeddingThemeMutation();
  const [sendToast] = useToast();
  const defaultThemeSettings = useDefaultEmbeddingThemeSettings();

  const [themeToDelete, setThemeToDelete] = useState<number | null>(null);

  const handleCreateTheme = async () => {
    try {
      const newTheme = await createTheme({
        name: t`Untitled theme`,
        settings: defaultThemeSettings,
      }).unwrap();

      dispatch(push(`/admin/embedding/themes/${newTheme.id}`));
    } catch (error) {
      console.error("Failed to create theme:", error);
      sendToast({ message: t`Failed to create theme`, icon: "warning" });
    }
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
        <Flex justify="space-between" align="center">
          <Title order={1}>{t`Themes`}</Title>

          <Button
            variant="filled"
            onClick={handleCreateTheme}
            leftSection={<Icon name="add" size={12} />}
          >{t`New theme`}</Button>
        </Flex>

        <Text c="text-secondary">
          {t`Configure themes for Embedded Analytics JS and SDK for React`}
        </Text>
      </Stack>

      {/* Theme cards */}
      {themes && themes.length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {themes.map((theme) => (
            <EmbeddingThemeCard
              key={theme.id}
              theme={theme}
              onEdit={() =>
                dispatch(push(`/admin/embedding/themes/${theme.id}`))
              }
              onDuplicate={() => handleDuplicateTheme(theme.id)}
              onDelete={() => setThemeToDelete(theme.id)}
            />
          ))}
        </SimpleGrid>
      ) : (
        <Stack align="center" justify="center" h={200}>
          {/** This would only show up when an admin intentionally deletes the default themes. */}
          <EmptyState
            message={t`Create your first theme to get started`}
            illustrationElement={<NoObjectError mb="-3rem" />}
          />
        </Stack>
      )}

      <DeleteThemeModal
        isOpen={themeToDelete !== null}
        onCancel={() => setThemeToDelete(null)}
        onDelete={handleDeleteTheme}
      />
    </Stack>
  );
}
