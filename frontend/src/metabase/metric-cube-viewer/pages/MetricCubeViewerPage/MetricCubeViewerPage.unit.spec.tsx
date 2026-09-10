import userEvent from "@testing-library/user-event";

import {
  setupMeasureEndpoint,
  setupMetricDatasetEndpoint,
  setupSegmentsEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { TOTAL_MEASURE } from "metabase/metrics-viewer/utils/__tests__/test-helpers";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { Measure, Table } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockMeasure,
  createMockMetricDimension,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { trackMetricCubeViewerViewed } from "../../analytics";

import { MetricCubeViewerPage } from "./MetricCubeViewerPage";

jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="visualization" />),
}));

jest.mock("../../analytics", () => ({
  trackMetricCubeViewerViewed: jest.fn(),
  trackMetricCubeViewerCardAdded: jest.fn(),
  trackMetricCubeViewerCardEdited: jest.fn(),
  trackMetricCubeViewerCardRemoved: jest.fn(),
  trackMetricCubeViewerDisplayChanged: jest.fn(),
  trackMetricCubeViewerReset: jest.fn(),
  trackMetricCubeViewerSettingsApplied: jest.fn(),
}));

const MEASURE: Measure = createMockMeasure({
  ...TOTAL_MEASURE,
  dimensions: [
    createMockMetricDimension({
      id: "measure-dim-created-at",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
      sources: [{ type: "field", "field-id": ORDERS.CREATED_AT }],
    }),
    createMockMetricDimension({
      id: "measure-dim-quantity",
      display_name: "Quantity",
      effective_type: "type/Integer",
      semantic_type: "type/Quantity",
      sources: [{ type: "field", "field-id": ORDERS.QUANTITY }],
    }),
  ],
});

const DATASET = createMockDataset({
  data: {
    cols: [
      createMockColumn({
        name: "CREATED_AT",
        display_name: "Created At",
        base_type: "type/DateTime",
      }),
      createMockColumn({
        name: "sum",
        display_name: "Total Revenue",
        base_type: "type/Float",
      }),
    ],
    rows: [["2024-01-01T00:00:00Z", 10]],
  },
});

function setup({
  table = createOrdersTable({ measures: [MEASURE], segments: [] }),
  route = `/explore/table/${ORDERS_ID}`,
}: { table?: Table; route?: string } = {}) {
  setupTableQueryMetadataEndpoint(table);
  (table.measures ?? []).forEach((measure) => setupMeasureEndpoint(measure));
  setupSegmentsEndpoints([]);
  setupMetricDatasetEndpoint(DATASET);

  renderWithProviders(
    <Route path="/explore/table/:tableId" element={<MetricCubeViewerPage />} />,
    {
      withRouter: true,
      initialRoute: route,
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
      }),
    },
  );
}

describe("MetricCubeViewerPage", () => {
  beforeEach(() => {
    jest.mocked(trackMetricCubeViewerViewed).mockClear();
  });

  it("renders the header, the overview row and the card grid", async () => {
    setup();

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Settings/ }),
    ).toBeInTheDocument();

    const overviewRow = await screen.findByTestId("cube-overview-row");
    expect(overviewRow).toHaveTextContent(MEASURE.name);

    const grid = screen.getByTestId("cube-card-grid");
    expect(grid).toHaveTextContent(`${MEASURE.name} by Created At`);

    await waitFor(() => {
      expect(screen.getAllByTestId("visualization").length).toBeGreaterThan(0);
    });
  });

  it("shows the empty state when the table has no measures", async () => {
    setup({ table: createOrdersTable({ measures: [], segments: [] }) });

    expect(
      await screen.findByText("This table doesn't have any measures yet."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("cube-card")).not.toBeInTheDocument();
  });

  it("tracks the view with the default generator", async () => {
    setup();

    await screen.findByText("Orders");
    expect(trackMetricCubeViewerViewed).toHaveBeenCalledWith("score-and-pick");
  });

  it("switches the generator with ?generator=", async () => {
    setup({ route: `/explore/table/${ORDERS_ID}?generator=every-combination` });

    await screen.findByText("Orders");
    expect(trackMetricCubeViewerViewed).toHaveBeenCalledWith(
      "every-combination",
    );
  });

  it("opens the settings modal from the header", async () => {
    setup();
    await screen.findByText("Orders");

    await userEvent.click(screen.getByRole("button", { name: /Settings/ }));

    expect(await screen.findByText("Viewer settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Measures to display")).toBeEnabled();
  });

  it("asks for confirmation before resetting from the header menu", async () => {
    setup();
    await screen.findByText("Orders");

    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Reset viewer/ }),
    );

    expect(await screen.findByText("Reset viewer?")).toBeInTheDocument();
  });

  it("renders the filter bar with the default filter dimensions", async () => {
    setup();
    await screen.findByText("Orders");

    expect(
      await screen.findByLabelText("Filter by Created At"),
    ).toBeInTheDocument();
  });

  it("removes a card and switches to fine mode, locking the settings", async () => {
    setup();
    const grid = await screen.findByTestId("cube-card-grid");
    const card = within(grid).getAllByTestId("cube-card")[0];
    const cardCount = within(grid).getAllByTestId("cube-card").length;

    await userEvent.click(
      within(card).getByRole("button", { name: "Card actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Remove card/ }),
    );

    await waitFor(() => {
      expect(within(grid).queryAllByTestId("cube-card")).toHaveLength(
        cardCount - 1,
      );
    });
    // Overview cards get the menu only in fine mode.
    const overviewRow = screen.getByTestId("cube-overview-row");
    expect(
      within(overviewRow).getByRole("button", { name: "Card actions" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(await screen.findByLabelText("Measures to display")).toBeDisabled();
  });

  it("adds a custom card from the editor", async () => {
    setup();
    const grid = await screen.findByTestId("cube-card-grid");
    const cardCount = within(grid).getAllByTestId("cube-card").length;

    await userEvent.click(screen.getByRole("button", { name: /Add card/ }));
    expect(await screen.findByText("New card")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(within(grid).getAllByTestId("cube-card")).toHaveLength(
        cardCount + 1,
      );
    });
    expect(screen.queryByText("New card")).not.toBeInTheDocument();
  });

  it("falls back to the default generator for unknown ids", async () => {
    setup({ route: `/explore/table/${ORDERS_ID}?generator=nope` });

    await screen.findByText("Orders");
    expect(trackMetricCubeViewerViewed).toHaveBeenCalledWith("score-and-pick");
  });
});
