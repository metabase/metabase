import type { ComponentProps } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { Table } from "metabase/visualizations/visualizations/Table/Table";
import type { Series, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

// ExplicitSize provides the measured container `width`/`height` in the browser;
// in jsdom we mock it so the table renders with a known, wide container.
jest.mock("metabase/common/components/ExplicitSize/ExplicitSize");

const CONTAINER_WIDTH = 800;

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

// Two narrow columns whose natural widths sum to far less than the container.
const cols = [
  createMockColumn({
    id: ORDERS.ID,
    name: "ID",
    display_name: "ID",
    field_ref: ["field", ORDERS.ID, null],
  }),
  createMockColumn({
    id: ORDERS.QUANTITY,
    name: "QUANTITY",
    display_name: "Quantity",
    field_ref: ["field", ORDERS.QUANTITY, null],
  }),
];

const rows = [
  [1, 2],
  [3, 4],
];

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

const setup = ({ isEmbeddingSdk }: { isEmbeddingSdk: boolean }) => {
  const props = {
    series,
    settings: {
      "table.columns": [
        { name: "ID", enabled: true },
        { name: "QUANTITY", enabled: true },
      ],
    } as unknown as VisualizationSettings,
    metadata,
    width: CONTAINER_WIDTH,
    height: 400,
    isEmbeddingSdk,
  } as unknown as ComponentProps<typeof Table>;
  renderWithProviders(<Table {...props} />);
};

// The center column section is sized to the grid's total column width, so its
// pixel width tells us whether the columns were expanded to fill the container.
const getGridColumnsWidth = () =>
  parseFloat(screen.getByTestId("header-center-quadrant").style.width);

describe("Table column expansion in embedding (metabase#69831)", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("expands columns to span the full container width in the embedding SDK", () => {
    setup({ isEmbeddingSdk: true });
    expect(getGridColumnsWidth()).toBeGreaterThanOrEqual(CONTAINER_WIDTH);
  });

  it("leaves columns at their natural width outside the embedding SDK", () => {
    setup({ isEmbeddingSdk: false });
    expect(getGridColumnsWidth()).toBeLessThan(CONTAINER_WIDTH);
  });
});
