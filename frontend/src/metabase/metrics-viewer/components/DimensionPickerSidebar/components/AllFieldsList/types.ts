import type { DimensionPickerSection } from "metabase/metrics-viewer/utils";

export type AllFieldsMetricGroup = {
  key: string;
  name: string;
  colors?: string[];
  isExpressionToken: boolean;
  sections: DimensionPickerSection[];
};
