import type {
  DimensionMetadata,
  FilterClause,
  MetricDefinition,
} from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SourceColorMap,
} from "../../types/viewer-state";

export type ValidDefinitionEntry = MetricsViewerDefinitionEntry & {
  definition: MetricDefinition;
};

export type NavigationState =
  | { view: "list" }
  | { view: "filter"; entryIndex: number; dimension: DimensionMetadata };

export interface FilterPopoverContentProps {
  validEntries: ValidDefinitionEntry[];
  metricColors: SourceColorMap;
  onFilterApplied: (entryId: MetricSourceId, filter: FilterClause) => void;
}
