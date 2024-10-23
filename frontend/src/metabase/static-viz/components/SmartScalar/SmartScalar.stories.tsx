import { colors } from "metabase/lib/colors";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RowValues, VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { StaticVisualization } from "../StaticVisualization";

const COLS = [
  createMockColumn({
    name: "Date",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
  }),
  createMockColumn({
    name: "Count",
    base_type: "type/Integer",
    effective_type: "type/Integer",
  }),
  createMockColumn({
    name: "Average",
    base_type: "type/Integer",
    effective_type: "type/Integer",
  }),
];

const ROWS: Record<string, RowValues[]> = {
  DEFAULT: [
    ["2019-09-01", 270, 250],
    ["2019-10-01", 300, 210],
    ["2019-11-01", 310, 190],
  ],
  BIG_NUMBERS: [
    ["2019-09-01", 271050, 250150],
    ["2019-10-01", 304100, 299501],
    ["2019-11-01", 4000000, 3200000],
  ],
  NULL_VALUE: [
    ["2019-09-01", 270, 250],
    ["2019-10-01", 300, null],
    ["2019-11-01", 310, 190],
  ],
  MISSING_INTERVAL: [
    ["2019-09-01", 270, 250],
    ["2019-11-01", 310, 190],
  ],
};

type SmartScalarSeriesOpts = {
  rows?: RowValues[];
  vizSettings: VisualizationSettings;
};

function createSmartScalarSeries({
  rows = ROWS.DEFAULT,
  vizSettings,
}: SmartScalarSeriesOpts) {
  return createMockSingleSeries(
    {
      display: "smartscalar",
      visualization_settings: vizSettings,
    },
    {
      data: {
        cols: COLS,
        rows,
        insights: [
          {
            unit: "month",
            col: "Count",
            offset: 0,
            slope: 0,
            "last-change": 0,
            "previous-value": 0,
            "last-value": 0,
          },
          {
            unit: "month",
            col: "Average",
            offset: 0,
            slope: 0,
            "last-change": 0,
            "previous-value": 0,
            "last-value": 0,
          },
        ],
      },
    },
  );
}

export default {
  title: "static-viz/SmartScalar",
  component: StaticVisualization,
  args: {
    "scalar.field": "Count",
    "scalar.comparisons": [{ id: "1", type: "previousPeriod" }],
    "scalar.switch_positive_negative": false,
    "scalar.compact_primary_number": false,
  },
  argTypes: {
    "scalar.field": {
      control: { type: "select" },
      options: ["Count", "Average"],
    },
    "scalar.switch_positive_negative": {
      control: { type: "boolean" },
    },
    "scalar.compact_primary_number": {
      control: { type: "boolean" },
    },
  },
};

const createTemplate = ({ rows, vizSettings }: SmartScalarSeriesOpts) =>
  function Template(args: VisualizationSettings) {
    const series = createSmartScalarSeries({
      rows,
      vizSettings: {
        ...args,
        ...vizSettings,
      },
    });

    return (
      <StaticVisualization
        rawSeries={[series]}
        renderingContext={{
          fontFamily: "Lato",
          getColor: createColorGetter(colors),
          measureText: (text, style) =>
            measureTextWidth(text, Number(style.size), Number(style.weight)),
          measureTextHeight: (_, style) =>
            measureTextHeight(Number(style.size)),

          theme: DEFAULT_VISUALIZATION_THEME,
        }}
      />
    );
  };

export const Default = createTemplate({
  vizSettings: {
    "scalar.comparisons": [{ id: "1", type: "previousPeriod" }],
  },
});

export const BigNumbers = createTemplate({
  rows: ROWS.BIG_NUMBERS,
  vizSettings: {
    "scalar.comparisons": [
      { id: "1", type: "previousPeriod" },
      { id: "2", type: "staticNumber", value: 150000, label: "Goal" },
    ],
  },
});

export const NullValue = createTemplate({
  rows: ROWS.NULL_VALUE,
  vizSettings: {
    "scalar.field": "Average",
    "scalar.comparisons": [
      { id: "1", type: "previousPeriod" },
      { id: "2", type: "previousValue" },
      { id: "3", type: "periodsAgo", value: 3 },
    ],
  },
});

export const MissingInterval = createTemplate({
  rows: ROWS.MISSING_INTERVAL,
  vizSettings: {
    "scalar.comparisons": [
      { id: "1", type: "previousPeriod" },
      { id: "2", type: "previousValue" },
      { id: "3", type: "periodsAgo", value: 3 },
    ],
  },
});

export const Comparisons = createTemplate({
  vizSettings: {
    "scalar.comparisons": [
      { id: "1", type: "periodsAgo", value: 3 },
      { id: "2", type: "staticNumber", value: 290, label: "Goal" },
      { id: "3", type: "anotherColumn", column: "Average", label: "Average" },
    ],
  },
});
