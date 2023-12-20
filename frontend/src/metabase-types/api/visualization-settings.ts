// SmartScalar (Trend Chart)
export type SmartScalarComparisonPeriodsAgo = {
  type: "periodsAgo";
  value: number;
};
type SmartScalarComparisonPreviousPeriod = {
  type: "previousPeriod";
};
type SmartScalarComparisonCompareToPrevious = {
  type: "previousValue";
};

export type SmartScalarComparison =
  | SmartScalarComparisonCompareToPrevious
  | SmartScalarComparisonPreviousPeriod
  | SmartScalarComparisonPeriodsAgo;
