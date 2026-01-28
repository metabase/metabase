import type { ConditionalFormattingComparisonOperator } from "metabase-types/api";

export type NumberFormattingOperator = ConditionalFormattingComparisonOperator;

export type NumberSingleFormattingSetting = {
  type: "single";
  operator: NumberFormattingOperator;
  color: string;
  value: string | number;
};

export type NumberRangeFormattingSetting = {
  type: "range";
  colors: string[];
  min_type: "custom";
  max_type: "custom";
  min_value?: number;
  max_value?: number;
};

export type NumberFormattingSetting =
  | NumberSingleFormattingSetting
  | NumberRangeFormattingSetting;
