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
  metricName: string;
  icon: "metric" | "ruler";
  sections: DimensionSection[];
};
