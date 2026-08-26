import type { DimensionType } from "metabase/common/metrics/utils/dimension-types";
import type {
  BooleanFilterParts,
  CoordinateFilterParts,
  DefaultFilterParts,
  ExcludeDateFilterParts,
  NumberFilterParts,
  RelativeDateFilterParts,
  SpecificDateFilterParts,
  StringFilterParts,
  TimeFilterParts,
} from "metabase-lib/metric";
import type { CardDisplayType } from "metabase-types/api";

export type MetricsViewerDisplayType = Extract<
  CardDisplayType,
  "line" | "area" | "bar" | "map" | "scatter" | "scalar"
>;

export type MetricsViewerDimensionBreakoutType = DimensionType | "scalar";

// ── Dimension filter value (serializable, dimension-free) ──

export type DimensionFilterValue =
  | {
      type: "string";
      operator: StringFilterParts["operator"];
      values: string[];
      options: StringFilterParts["options"];
    }
  | {
      type: "boolean";
      operator: BooleanFilterParts["operator"];
      values: boolean[];
    }
  | {
      type: "number";
      operator: NumberFilterParts["operator"];
      values: NumberFilterParts["values"];
    }
  | {
      type: "coordinate";
      operator: CoordinateFilterParts["operator"];
      values: CoordinateFilterParts["values"];
    }
  | {
      type: "specific-date";
      operator: SpecificDateFilterParts["operator"];
      values: Date[];
      hasTime: boolean;
    }
  | {
      type: "relative-date";
      unit: RelativeDateFilterParts["unit"];
      value: number;
      offsetUnit: RelativeDateFilterParts["offsetUnit"];
      offsetValue: RelativeDateFilterParts["offsetValue"];
      options: RelativeDateFilterParts["options"];
    }
  | {
      type: "exclude-date";
      operator: ExcludeDateFilterParts["operator"];
      unit: ExcludeDateFilterParts["unit"];
      values: number[];
    }
  | { type: "time"; operator: TimeFilterParts["operator"]; values: Date[] }
  | { type: "default"; operator: DefaultFilterParts["operator"] };
