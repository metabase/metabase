import { NavLink, Text } from "metabase/ui";
import { Icon } from "metabase/ui";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useListTransformsQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

interface TransformEntitiesListProps {
  selectedTransformId?: number;
  onTransformClick?: (transform: Transform) => void;
}

export function TransformEntitiesList({
  selectedTransformId,
  onTransformClick,
}: TransformEntitiesListProps) {
  const { data: transforms = [], isLoading, error } = useListTransformsQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transforms.length === 0) {
    return (
      <Text size="sm" ta="center" py="md">
        No transforms found
      </Text>
    );
  }

  return (
    <>
      {transforms.map((transform) => (
        <NavLink
          key={transform.id}
          label={transform.name}
          description={transform.target.name}
          leftSection={<Icon name="model" size={16} />}
          active={selectedTransformId === transform.id}
          onClick={() => onTransformClick?.(transform)}
        />
      ))}
    </>
  );
}
