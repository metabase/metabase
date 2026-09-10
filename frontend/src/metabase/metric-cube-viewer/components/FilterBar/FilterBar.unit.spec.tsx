import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import {
  TOTAL_MEASURE,
  measureMetadata,
  setupMeasureDefinition,
} from "metabase/metrics-viewer/utils/__tests__/test-helpers";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import { NO_FILTERS, renderWithStaticViewer } from "../../tests/setup";
import type {
  CardGenerator,
  CubeCatalog,
  CubeFilters,
  CubeViewerState,
} from "../../types";

import { FilterBar } from "./FilterBar";

const CREATED_AT_KEY = `field:${ORDERS.CREATED_AT}`;
const QUANTITY_KEY = `field:${ORDERS.QUANTITY}`;

const CATALOG: CubeCatalog = {
  tableId: ORDERS_ID,
  measures: [
    {
      id: TOTAL_MEASURE.id,
      name: TOTAL_MEASURE.name,
      isAdditive: true,
      dimensionIds: {
        [CREATED_AT_KEY]: "measure-dim-created-at",
        [QUANTITY_KEY]: "measure-dim-quantity",
      },
    },
  ],
  dimensions: [
    {
      key: CREATED_AT_KEY,
      label: "Created At",
      type: "time",
      score: 0.8,
      distinctCount: null,
      canListValues: false,
    },
    {
      key: QUANTITY_KEY,
      label: "Quantity",
      type: "numeric",
      score: 0.5,
      distinctCount: 50,
      canListValues: false,
    },
  ],
  segments: [
    { id: 20, name: "Big orders" },
    { id: 21, name: "Gadgets" },
  ],
};

const GENERATOR: CardGenerator = {
  id: "test-generator",
  name: "Test",
  description: "Test generator",
  getDefaultSettings: () => ({
    measureIds: [TOTAL_MEASURE.id],
    dimensionKeys: [CREATED_AT_KEY],
    filterDimensionKeys: [CREATED_AT_KEY, QUANTITY_KEY],
  }),
  generateCards: () => [],
};

function setup({
  catalog = CATALOG,
  filters = NO_FILTERS,
}: { catalog?: CubeCatalog; filters?: CubeFilters } = {}) {
  const state: CubeViewerState = {
    generatorId: GENERATOR.id,
    mode: "coarse",
    settings: GENERATOR.getDefaultSettings(catalog),
    cards: [],
    displayOverrides: {},
    filters,
  };
  const definitions = new Map([
    [
      TOTAL_MEASURE.id,
      setupMeasureDefinition(measureMetadata, TOTAL_MEASURE.id),
    ],
  ]);
  return renderWithStaticViewer({
    catalog,
    generator: GENERATOR,
    state,
    definitions,
    children: <FilterBar />,
  });
}

describe("FilterBar", () => {
  it("renders a segment pill and one pill per filter dimension", () => {
    setup();

    expect(screen.getByLabelText("Segment filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Created At")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Quantity")).toBeInTheDocument();
  });

  it("hides the segment pill when the table has no segments", () => {
    setup({ catalog: { ...CATALOG, segments: [] } });

    expect(screen.queryByLabelText("Segment filter")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Quantity")).toBeInTheDocument();
  });

  it("renders nothing without segments or filter dimensions", () => {
    setup({
      catalog: {
        ...CATALOG,
        segments: [],
        measures: [{ ...CATALOG.measures[0], dimensionIds: {} }],
      },
    });

    expect(screen.queryByTestId("cube-filter-bar")).not.toBeInTheDocument();
  });

  it("toggles segments with AND semantics through setFilters", async () => {
    const { actions } = setup({
      filters: { ...NO_FILTERS, segmentIds: [20] },
    });

    const pill = screen.getByLabelText("Segment filter");
    expect(pill).toHaveTextContent("Big orders");

    await userEvent.click(pill);
    await userEvent.click(await screen.findByLabelText("Gadgets"));

    expect(actions.setFilters).toHaveBeenCalledWith({
      segmentIds: [20, 21],
      dimensionFilters: [],
    });
  });

  it("clears the segment filter from the pill", async () => {
    const { actions } = setup({
      filters: { ...NO_FILTERS, segmentIds: [20] },
    });

    await userEvent.click(
      within(screen.getByLabelText("Segment filter")).getByRole("button", {
        name: "Remove",
      }),
    );

    expect(actions.setFilters).toHaveBeenCalledWith(NO_FILTERS);
  });

  it("stores a parsed dimension filter value", async () => {
    const { actions } = setup();

    await userEvent.click(screen.getByLabelText("Filter by Quantity"));
    await userEvent.click(await screen.findByLabelText("Filter operator"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Greater than" }),
    );
    await userEvent.type(screen.getByLabelText("Filter value"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

    expect(actions.setFilters).toHaveBeenCalledWith({
      segmentIds: [],
      dimensionFilters: [
        {
          dimensionKey: QUANTITY_KEY,
          value: { type: "number", operator: ">", values: [5] },
        },
      ],
    });
  });

  it("shows the active filter on the pill and clears it", async () => {
    const { actions } = setup({
      filters: {
        segmentIds: [],
        dimensionFilters: [
          {
            dimensionKey: QUANTITY_KEY,
            value: { type: "number", operator: ">", values: [5] },
          },
        ],
      },
    });

    const pill = screen.getByLabelText("Filter by Quantity");
    expect(pill).toHaveTextContent("Quantity greater than: 5");

    await userEvent.click(within(pill).getByRole("button", { name: "Remove" }));

    expect(actions.setFilters).toHaveBeenCalledWith(NO_FILTERS);
  });
});
