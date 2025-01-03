import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import { COMPARISON_TYPES } from "metabase/visualizations/visualizations/SmartScalar/constants";
import type { RowValues, SmartScalarComparison } from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks";

export const PREVIOUS_PERIOD_COMPARISON = {
  id: "1",
  type: COMPARISON_TYPES.PREVIOUS_PERIOD,
};

export const PREVIOUS_VALUE_COMPARISON = {
  id: "1",
  type: COMPARISON_TYPES.PREVIOUS_VALUE,
};

export const getPeriodsAgoComparison = (value: number) => ({
  id: "1",
  type: COMPARISON_TYPES.PERIODS_AGO,
  value,
});

interface MockSeriesOptions {
  rows: RowValues[];
  insights?: Partial<Insight>[];
  field?: string;
  comparisonType?: SmartScalarComparison;
}

export const mockSeries = ({
  rows,
  insights,
  field,
  comparisonType = PREVIOUS_PERIOD_COMPARISON,
}: MockSeriesOptions) => {
  const cols = [
    DateTimeColumn({ name: "Month" }),
    NumberColumn({ name: "Count" }),
    NumberColumn({ name: "Sum" }),
  ];

  return [
    {
      card: {
        display: "smartscalar",
        visualization_settings: {
          "scalar.field": field,
          "scalar.comparisons": [comparisonType],
        },
        dataset_query: createMockStructuredDatasetQuery(),
      },
      data: { cols, rows, insights },
    },
  ];
};
