import { t } from "ttag";

import { Group, Icon, Pill, Text } from "metabase/ui";
import type { IconName, SearchPromptEntityRef } from "metabase-types/api";

const ENTITY_ICONS: Record<string, IconName> = {
  card: "table2",
  dataset: "model",
  metric: "metric",
  table: "table",
  dashboard: "dashboard",
  collection: "folder",
  measure: "ruler",
};

export function SearchPromptEntityList({
  entities,
  onRemove,
}: {
  entities: SearchPromptEntityRef[];
  onRemove?: (entity: SearchPromptEntityRef) => void;
}) {
  if (entities.length === 0) {
    return <Text c="text-tertiary">{t`No entities`}</Text>;
  }

  return (
    <Group gap="xs">
      {entities.map((entity) => (
        <Pill
          key={`${entity.model}-${entity.id}`}
          withRemoveButton={Boolean(onRemove)}
          onRemove={() => onRemove?.(entity)}
        >
          <Group gap="xs" wrap="nowrap" component="span" display="inline-flex">
            <Icon name={ENTITY_ICONS[entity.model] ?? "unknown"} size={12} />
            {entity.name}
          </Group>
        </Pill>
      ))}
    </Group>
  );
}
