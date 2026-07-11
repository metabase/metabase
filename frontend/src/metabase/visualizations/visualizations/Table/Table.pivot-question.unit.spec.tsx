import type { ComponentProps } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import { Table } from "metabase/visualizations/visualizations/Table/Table";
import type { Series, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

// Capture the props the Table viz hands down to TableInteractive so we can
// assert on the `question` it forwards.
const lastTableInteractiveProps: { question: unknown }[] = [];

jest.mock(
  "metabase/visualizations/components/TableInteractive/TableInteractive",
  () => ({
    __esModule: true,
    TableInteractive: (props: { question: unknown }) => {
      lastTableInteractiveProps.push({ question: props.question });
      return <div data-testid="table-interactive-stub" />;
    },
  }),
);

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

// A 3-column result (row dimension + pivot dimension + metric) that the Table
// viz auto-pivots — exactly the shape from metabase#45481 (Count grouped by two
// breakouts).
const cols = [
  createMockColumn({ name: "USER_ID", display_name: "User ID" }),
  createMockColumn({ name: "CATEGORY", display_name: "Category" }),
  createMockColumn({
    name: "count",
    display_name: "Count",
    source: "aggregation",
  }),
];

const rows = [
  [1, "Widget", 10],
  [1, "Gizmo", 20],
  [2, "Widget", 30],
];

const pivotSettings = {
  "table.pivot": true,
  "table.pivot_column": "CATEGORY",
  "table.cell_column": "count",
} as unknown as VisualizationSettings;

const series = [
  {
    card: createMockCard({
      display: "table",
      dataset_query: {
        type: "query",
        query: { "source-table": ORDERS_ID },
        database: SAMPLE_DB_ID,
      },
    }),
    data: createMockDatasetData({ cols, rows }),
  },
] as unknown as Series;

const setup = () => {
  lastTableInteractiveProps.length = 0;
  const props = {
    series,
    settings: pivotSettings,
    metadata,
  } as unknown as ComponentProps<typeof Table>;
  renderWithProviders(<Table {...props} />);
};

describe("Table auto-pivot (metabase#45481)", () => {
  it("caches the question in state when the result is auto-pivoted", () => {
    // sanity: this fixture really is treated as pivoted
    expect(Table.isPivoted(series, pivotSettings)).toBe(true);

    setup();

    expect(screen.getByTestId("table-interactive-stub")).toBeInTheDocument();

    // The bug: the pivot branch of `_updateData` omitted `question` from
    // setState, so a null question flowed into the pivoted table render and
    // crashed it. Guard that the pivoted branch stores the question.
    const props = lastTableInteractiveProps.at(-1);
    expect(props?.question).not.toBeNull();
    expect(props?.question).toBeDefined();
  });
});
