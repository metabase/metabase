import type { Section as BaseSection } from "metabase/common/components/AccordionList";
import type * as LibMetric from "metabase-lib/metric";

export type DimensionListItem = {
  name: string;
  definition: LibMetric.MetricDefinition;
  definitionIndex: number;
  dimension: LibMetric.DimensionMetadata;
};

export type SegmentListItem = {
  name: string;
  definitionIndex: number;
  definition: LibMetric.MetricDefinition;
  segment: LibMetric.SegmentMetadata;
};

export type FilterItem = DimensionListItem | SegmentListItem;

export type MetricGroupFilterSection = BaseSection<FilterItem> & {
  /** True only for the metric's "main" (source-table) group. */
  isSourceTable?: boolean;
};

export type MetricGroup = {
  id: number;
  metricName: string;
  metricCount?: number;
  icon?: "metric" | "ruler";
  colors: string[] | undefined;
  sections: MetricGroupFilterSection[];
  /** Only used for empty-state copy selection. */
  hasSegments: boolean;
};

export const isSegmentListItem = (item: FilterItem): item is SegmentListItem =>
  (item as SegmentListItem).segment != null;
