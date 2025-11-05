import { t } from "ttag";

import { useListEmbeddingThemesQuery } from "metabase/api/embedding-theme";
import EmptyState from "metabase/common/components/EmptyState";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
import { Loader, SimpleGrid, Stack, Text, Title } from "metabase/ui";

import { EmbeddingThemeCard } from "./EmbeddingThemeCard";

export function EmbeddingThemeListingApp() {
  const { data: themes, isLoading } = useListEmbeddingThemesQuery();

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
          {t`Configure themes for Embedded Analytics JS, SDK for React, and new static embedding.`}
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
          <EmptyState
            message={t`Create your first theme to get started.`}
            illustrationElement={<NoObjectError mb="-1.5rem" />}
          />
        </Stack>
      )}
    </Stack>
  );
}
