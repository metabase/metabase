import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import type {
  IconName,
  MetricDimension,
  MetricDimensionSource,
} from "metabase-types/api";

export function getDimensionIcon(dimension: MetricDimension): IconName {
  return getColumnIcon(
    Lib.legacyColumnTypeInfo({
      effective_type: dimension.effective_type,
      semantic_type: dimension.semantic_type,
    }),
  );
}

export interface DimensionSourceOption {
  value: string;
  label: string;
  source: MetricDimensionSource;
}

// Source columns currently lack a backend-provided display label, so we fall
// back to the field id until that lands.
export function getDimensionSourceOptions(
  dimension: MetricDimension,
): DimensionSourceOption[] {
  return (dimension.sources ?? []).map((source) => ({
    value: String(source["field-id"]),
    label: String(source["field-id"]),
    source,
  }));
}
