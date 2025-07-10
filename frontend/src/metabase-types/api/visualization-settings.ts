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

export interface SmartScalarComparisonAnotherColumn
  extends BaseSmartScalarComparison {
  type: "anotherColumn";
  column: string;
  label: string;
}

export interface SmartScalarComparisonPeriodsAgo
  extends BaseSmartScalarComparison {
  type: "periodsAgo";
  value: number;
}

export interface SmartScalarComparisonPreviousPeriod
  extends BaseSmartScalarComparison {
  type: "previousPeriod";
}

export interface SmartScalarComparisonPreviousValue
  extends BaseSmartScalarComparison {
  type: "previousValue";
}

export interface SmartScalarComparisonStaticNumber
  extends BaseSmartScalarComparison {
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
