import { ActionIcon, Group, Text } from "metabase/ui";
import { Icon } from "metabase/ui";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import type { Card } from "metabase-types/api";

interface ModelsEntitiesListProps {
  selectedModelId?: number;
  onModelClick?: (model: Card) => void;
}

export function ModelsEntitiesList({
  selectedModelId,
  onModelClick,
}: ModelsEntitiesListProps) {
  const { data: searchResponse, isLoading, error } = useFetchModels();

  if (isLoading) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const models = searchResponse?.data || [];

  if (models.length === 0) {
    return (
      <Text size="sm" ta="center" py="md">
        No models found
      </Text>
    );
  }

  return (
    <>
      {models.map((model) => (
        <Group
          key={model.id}
          p="xs"
          style={{
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor:
              selectedModelId === model.id
                ? "var(--mantine-color-blue-1)"
                : "transparent",
            ":hover": {
              backgroundColor:
                selectedModelId === model.id
                  ? "var(--mantine-color-blue-2)"
                  : "var(--mantine-color-gray-1)",
            },
          }}
          onClick={() => onModelClick?.(model)}
        >
          <ActionIcon variant="subtle" size="sm">
            <Icon name="model" />
          </ActionIcon>
          <Text size="sm" style={{ flex: 1 }} truncate>
            {model.name}
          </Text>
          <Text size="xs">{model.collection?.name || "No collection"}</Text>
        </Group>
      ))}
    </>
  );
}
