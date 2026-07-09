import { createMockEntitiesState } from "__support__/store";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import registerVisualizations from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QueryEditorVisualization } from "./QueryEditorVisualization";

registerVisualizations();

const DATASET_QUERY = createMockStructuredDatasetQuery({
  database: SAMPLE_DB_ID,
  query: { "source-table": ORDERS_ID },
});

const COLS = [
  createMockColumn({
    id: ORDERS.ID,
    name: "ID",
    display_name: "ID",
    source: "fields",
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/PK",
    table_id: ORDERS_ID,
  }),
  createMockColumn({
    id: ORDERS.TOTAL,
    name: "TOTAL",
    display_name: "Total",
    source: "fields",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: null,
    table_id: ORDERS_ID,
  }),
];

const ROWS = [
  [1, 39.72],
  [2, 117.03],
  [3, 52.72],
];

function setup() {
  const card = createMockCard({
    display: "table",
    dataset_query: DATASET_QUERY,
  });

  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });
  const metadata = getMetadata(state);
  const question = new Question(card, metadata);

  const result: Dataset = createMockDataset({
    data: { cols: COLS, rows: ROWS },
  });
  const rawSeries: RawSeries = [{ card, data: result.data }];

  renderWithProviders(
    <QueryEditorVisualization
      question={question}
      result={result}
      rawSeries={rawSeries}
      isNative={false}
      isRunnable
      isRunning={false}
      isResultDirty={false}
      onRunQuery={jest.fn()}
      onCancelQuery={jest.fn()}
    />,
    { storeInitialState: state },
  );

  return { question };
}

describe("QueryEditorVisualization", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("should not show the 'View details' object-detail buttons in the transform visualization (metabase#64473)", async () => {
    setup();

    // The result table renders (a data cell from the ID column is present).
    expect(
      await screen.findByTestId("query-visualization-root"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Total")).toBeInTheDocument();

    // Because QueryEditorVisualization renders in "dataset" query-builder mode,
    // the row-id object-detail column (and its per-row "View details" button) is
    // hidden. Without the "dataset" mode one such button appears per rendered row.
    expect(screen.queryAllByTestId("detail-shortcut")).toHaveLength(0);
    expect(screen.queryAllByTestId("row-id-cell")).toHaveLength(0);
  });
});
