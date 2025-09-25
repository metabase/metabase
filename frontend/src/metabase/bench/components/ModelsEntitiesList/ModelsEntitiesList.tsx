import { NavLink, Text } from "metabase/ui";
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
        <NavLink
          key={model.id}
          label={model.name}
          description={model.collection?.name || "No collection"}
          leftSection={<Icon name="model" size={16} />}
          active={selectedModelId === model.id}
          onClick={() => onModelClick?.(model)}
        />
      ))}
    </>
  );
}
