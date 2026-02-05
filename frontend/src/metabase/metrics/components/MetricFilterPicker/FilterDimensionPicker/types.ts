import type { Section as BaseSection } from "metabase/common/components/AccordionList";
import type * as LibMetric from "metabase-lib/metric";

export type DimensionListItem = {
  name: string;
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
};

export type DimensionSection = BaseSection<DimensionListItem>;
