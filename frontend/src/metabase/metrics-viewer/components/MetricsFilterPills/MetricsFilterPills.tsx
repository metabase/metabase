import { useCallback } from "react";

import type { IconName } from "metabase/ui";
import { Group } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  SourceColorMap,
} from "../../types/viewer-state";

import { MetricsFilterPillPopover } from "./MetricsFilterPillPopover";

interface MetricsFilterPillsProps {
  definitions: MetricsViewerDefinitionEntry[];
  sourceColors: SourceColorMap;
  onUpdateDefinition: (id: DefinitionId, definition: MetricDefinition) => void;
}

type FlattenedFilter = {
  entryId: DefinitionId;
  definition: MetricDefinition;
  filter: LibMetric.FilterClause;
  color: string;
  icon: IconName;
  key: string;
};

export function MetricsFilterPills({
  definitions,
  sourceColors,
  onUpdateDefinition,
}: MetricsFilterPillsProps) {
  const flatFilters = getFlatFilters(definitions, sourceColors);

  const handleUpdate = useCallback(
    (
      entryId: DefinitionId,
      definition: MetricDefinition,
      oldFilter: LibMetric.FilterClause,
      newFilter: LibMetric.FilterClause,
    ) => {
      const newDef = LibMetric.replaceClause(definition, oldFilter, newFilter);
      onUpdateDefinition(entryId, newDef);
    },
    [onUpdateDefinition],
  );

  const handleRemove = useCallback(
    (
      entryId: DefinitionId,
      definition: MetricDefinition,
      filter: LibMetric.FilterClause,
    ) => {
      const newDef = LibMetric.removeClause(definition, filter);
      onUpdateDefinition(entryId, newDef);
    },
    [onUpdateDefinition],
  );

  if (flatFilters.length === 0) {
    return null;
  }

  return (
    <Group gap="sm">
      {flatFilters.map((item) => (
        <MetricsFilterPillPopover
          key={item.key}
          definition={item.definition}
          filter={item.filter}
          color={item.color}
          icon={item.icon}
          onUpdate={(newFilter) =>
            handleUpdate(item.entryId, item.definition, item.filter, newFilter)
          }
          onRemove={() =>
            handleRemove(item.entryId, item.definition, item.filter)
          }
        />
      ))}
    </Group>
  );
}

function getFlatFilters(
  definitions: MetricsViewerDefinitionEntry[],
  sourceColors: SourceColorMap,
): FlattenedFilter[] {
  const result: FlattenedFilter[] = [];

  for (const entry of definitions) {
    if (entry.definition == null) {
      continue;
    }
    const color = sourceColors[entry.id]?.[0] ?? "var(--mb-color-brand)";
    const icon: IconName = entry.id.startsWith("metric:") ? "metric" : "ruler";
    const filters = LibMetric.filters(entry.definition);
    for (let i = 0; i < filters.length; i++) {
      result.push({
        entryId: entry.id,
        definition: entry.definition,
        filter: filters[i],
        color,
        icon,
        key: `${entry.id}-${i}`,
      });
    }
  }

  return result;
}
