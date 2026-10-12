import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import { COMPARISON_TYPES } from "metabase/visualizations/visualizations/SmartScalar/constants";
import type {
  RowValues,
  Series,
  SmartScalarComparison,
  VisualizationSettings,
} from "metabase-types/api";
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

export const STATIC_NUMBER_COMPARISON = {
  id: "2",
  type: COMPARISON_TYPES.STATIC_NUMBER,
  value: 80,
  label: "Goal",
};

interface MockSeriesOptions {
  rows: RowValues[];
  insights?: Partial<Insight>[];
  field?: string;
  comparisonType?: SmartScalarComparison;
  comparisonTypes?: SmartScalarComparison[];
  name?: string;
  settings?: VisualizationSettings;
}

export const mockSeries = ({
  rows,
  insights,
  field,
  comparisonType = PREVIOUS_PERIOD_COMPARISON,
  comparisonTypes,
  name,
  settings,
}: MockSeriesOptions) => {
  const cols = [
    DateTimeColumn({ name: "Month", source: "breakout" }),
    NumberColumn({ name: "Count", source: "aggregation" }),
    NumberColumn({ name: "Sum", source: "aggregation" }),
  ];

  // Unjustified type cast. FIXME
  return [
    {
      card: {
        name,
        display: "smartscalar",
        visualization_settings: {
          "scalar.field": field,
          "scalar.comparisons": comparisonTypes ?? [comparisonType],
          ...settings,
        },
        dataset_query: createMockStructuredDatasetQuery(),
      },
      data: { cols, rows, insights },
    },
  ] as Series;
};
