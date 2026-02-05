import type * as LibMetric from "metabase-lib/metric";

import type { FilterChangeOpts } from "./types";

export type MetricFilterPickerProps = {
  definitions: LibMetric.MetricDefinition[];
  onChange: (
    definition: LibMetric.MetricDefinition,
    filter: LibMetric.FilterClause,
    opts: FilterChangeOpts,
  ) => void;
  onBack: () => void;
};
