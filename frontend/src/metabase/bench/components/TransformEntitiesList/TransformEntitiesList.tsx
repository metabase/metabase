import { ActionIcon, Group, Text } from "metabase/ui";
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
      <Text size="sm" c="dimmed" ta="center" py="md">
        No transforms found
      </Text>
    );
  }

  return (
    <>
      {transforms.map((transform) => (
        <Group
          key={transform.id}
          p="xs"
          style={{
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor:
              selectedTransformId === transform.id
                ? "var(--mantine-color-blue-1)"
                : "transparent",
            ":hover": {
              backgroundColor:
                selectedTransformId === transform.id
                  ? "var(--mantine-color-blue-2)"
                  : "var(--mantine-color-gray-1)",
            },
          }}
          onClick={() => onTransformClick?.(transform)}
        >
          <ActionIcon variant="subtle" size="sm">
            <Icon name="model" />
          </ActionIcon>
          <Text size="sm" style={{ flex: 1 }} truncate>
            {transform.name}
          </Text>
          <Text size="xs" c="dimmed">
            {transform.target.name}
          </Text>
        </Group>
      ))}
    </>
  );
}
