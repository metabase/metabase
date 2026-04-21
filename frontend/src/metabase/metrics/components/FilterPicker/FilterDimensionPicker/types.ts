import type { ListSection } from "metabase/common/components/DimensionPill";
import type * as LibMetric from "metabase-lib/metric";

export type DimensionListItem = {
  name: string;
  definition: LibMetric.MetricDefinition;
  definitionIndex: number;
  dimension: LibMetric.DimensionMetadata;
};

export type DimensionSection = ListSection<DimensionListItem>;

export type MetricGroup = {
  id: number;
  metricName: string;
  metricCount?: number;
  icon?: "metric" | "ruler";
  colors: string[] | undefined;
  sections: DimensionSection[];
};
