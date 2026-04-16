import type { Section as BaseSection } from "metabase/common/components/AccordionList";
import type * as LibMetric from "metabase-lib/metric";

export type DimensionListItem = {
  name: string;
  definition: LibMetric.MetricDefinition;
  definitionIndex: number;
  dimension: LibMetric.DimensionMetadata;
};

export type DimensionSection = BaseSection<DimensionListItem>;

export type MetricGroup = {
  id: number;
  metricName: string;
  metricCount?: number;
  icon?: "metric" | "ruler";
  colors: string[] | undefined;
  sections: DimensionSection[];
  segments: SegmentListItem[];
};

export type SegmentListItem = {
  name: string;
  definitionIndex: number;
  definition: LibMetric.MetricDefinition;
  segment: LibMetric.SegmentMetadata;
};
