import { t } from "ttag";

import {
  useCreateEmbeddingThemeMutation,
  useListEmbeddingThemesQuery,
} from "metabase/api/embedding-theme";
import EmptyState from "metabase/common/components/EmptyState";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
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

import { EmbeddingThemeCard } from "./EmbeddingThemeCard";

export function EmbeddingThemeListingApp() {
  const { data: themes, isLoading } = useListEmbeddingThemesQuery();
  const [createTheme] = useCreateEmbeddingThemeMutation();

  const handleCreateTheme = async () => {
    await createTheme({
      name: t`Untitled theme`,
      settings: {},
    }).unwrap();

    // TODO(EMB-946): Navigate to the theme editor to edit the newly created theme.
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
        <SimpleGrid cols={3} spacing="md">
          {themes.map((theme) => (
            <EmbeddingThemeCard
              key={theme.id}
              theme={theme}
              onEdit={() => {}}
              onDuplicate={() => {}}
              onDelete={() => {}}
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
    </Stack>
  );
}
