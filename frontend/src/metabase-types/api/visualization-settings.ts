// SmartScalar (Trend Chart)
export type SelectedComparisonPeriodsAgo = {
  type: "periodsAgo";
  value: number;
};
type SelectedComparisonPreviousPeriod = {
  type: "previousPeriod";
};
type SelectedComparisonCompareToPrevious = {
  type: "previousValue";
};

export type SelectedComparison =
  | SelectedComparisonCompareToPrevious
  | SelectedComparisonPreviousPeriod
  | SelectedComparisonPeriodsAgo;
