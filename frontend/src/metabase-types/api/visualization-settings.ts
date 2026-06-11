// SmartScalar (Trend Chart)
export type SmartScalarComparisonType =
  | "anotherColumn"
  | "previousValue"
  | "previousPeriod"
  | "periodsAgo"
  | "staticNumber";

interface BaseSmartScalarComparison {
  id: string; // client-side generated, used for sorting
  type: SmartScalarComparisonType;
}

export interface SmartScalarComparisonAnotherColumn extends BaseSmartScalarComparison {
  type: "anotherColumn";
  column: string;
  label: string;
}

export interface SmartScalarComparisonPeriodsAgo extends BaseSmartScalarComparison {
  type: "periodsAgo";
  value: number;
}

export interface SmartScalarComparisonPreviousPeriod extends BaseSmartScalarComparison {
  type: "previousPeriod";
}

export interface SmartScalarComparisonPreviousValue extends BaseSmartScalarComparison {
  type: "previousValue";
}

export interface SmartScalarComparisonStaticNumber extends BaseSmartScalarComparison {
  type: "staticNumber";
  value: number;
  label: string;
}

export type SmartScalarComparison =
  | SmartScalarComparisonAnotherColumn
  | SmartScalarComparisonPreviousValue
  | SmartScalarComparisonPreviousPeriod
  | SmartScalarComparisonPeriodsAgo
  | SmartScalarComparisonStaticNumber;

export interface PieRow {
  key: string;
  name: string;
  originalName: string;
  color: string;
  defaultColor: boolean;
  enabled: boolean;
  hidden: boolean;
  isOther: boolean;
}

export interface TreemapRow {
  key: string;
  name: string;
  originalName: string;
  color: string;
  defaultColor: boolean;
  /**
   * False when the user removed the group via the X in the settings list — the
   * group is excluded from the chart (and from totals/percentages) until it is
   * added back.
   */
  enabled: boolean;
  /**
   * True when the key is no longer present in the data — the row is retained
   * so customizations survive filter changes, but it is not shown in the
   * settings UI and never rendered.
   */
  hidden: boolean;
}
