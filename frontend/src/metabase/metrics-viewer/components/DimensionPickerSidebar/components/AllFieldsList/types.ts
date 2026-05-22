import type { MetricSourceId } from "metabase/metrics-viewer/types";
import type { DimensionPickerSection } from "metabase/metrics-viewer/utils";

export type AllFieldsMetricGroup = {
  key: MetricSourceId;
  name: string;
  colors?: string[];
  sections: DimensionPickerSection[];
};
