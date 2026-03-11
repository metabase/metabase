import { useCallback, useMemo } from "react";

import type { IconName } from "metabase/ui";
import { Group } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type { MetricSourceId, SourceColorMap } from "../../types/viewer-state";
import { getSourceIcon } from "../../utils/source-ids";
import type { DefinitionSource } from "../FilterPopover/FilterPopoverContent";

import { MetricsFilterPillPopover } from "./MetricsFilterPillPopover";

interface MetricsFilterPillsProps {
  definitions: DefinitionSource[];
  sourceColors: SourceColorMap;
  onUpdateDefinition: (
    id: MetricSourceId,
    definition: MetricDefinition,
  ) => void;
}

type FlattenedFilter = {
  entryId: MetricSourceId;
  definition: MetricDefinition;
  filter: LibMetric.FilterClause;
  colors: string[];
  icon: IconName;
  key: string;
};

export function MetricsFilterPills({
  definitions,
  sourceColors,
  onUpdateDefinition,
}: MetricsFilterPillsProps) {
  const flatFilters = useMemo(
    () => getFlatFilters(definitions, sourceColors),
    [definitions, sourceColors],
  );

  const handleUpdate = useCallback(
    (
      entryId: MetricSourceId,
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
      entryId: MetricSourceId,
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
          colors={item.colors}
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
  definitions: DefinitionSource[],
  sourceColors: SourceColorMap,
): FlattenedFilter[] {
  return definitions.flatMap((definition) => {
    const colors = sourceColors[definition.id] ?? ["var(--mb-color-brand)"];
    const icon = getSourceIcon(definition.id);
    return LibMetric.filters(definition.definition).map((filter, index) => ({
      entryId: definition.id,
      definition: definition.definition,
      filter,
      colors,
      icon,
      key: `${definition.id}-${index}`,
    }));
  });
}
