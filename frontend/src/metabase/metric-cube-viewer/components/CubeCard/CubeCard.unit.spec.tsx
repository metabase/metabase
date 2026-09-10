import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  TOTAL_MEASURE,
  measureMetadata,
  setupMeasureDefinition,
} from "metabase/metrics-viewer/utils/__tests__/test-helpers";
import { createMockColumn } from "metabase-types/api/mocks";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";
import { createMockSingleSeries } from "metabase-types/api/mocks/series";

import { MetricCubeViewerProvider } from "../../context";
import {
  type UseCubeCardSeriesResult,
  useCubeCardSeries,
} from "../../hooks/use-cube-card-series";
import type { CubeViewerActions } from "../../hooks/use-cube-viewer-state";
import { renderWithLiveViewer } from "../../tests/setup";
import type {
  CardGenerator,
  CubeCard as CubeCardModel,
  CubeCatalog,
  CubeFilters,
  CubeViewerState,
} from "../../types";

import { CubeCard } from "./CubeCard";

jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="visualization" />),
}));

jest.mock("../../hooks/use-cube-card-series", () => ({
  useCubeCardSeries: jest.fn(),
}));

jest.mock("../../analytics", () => ({
  trackMetricCubeViewerDisplayChanged: jest.fn(),
}));

const CREATED_AT_KEY = `field:${ORDERS.CREATED_AT}`;

const CATALOG: CubeCatalog = {
  tableId: ORDERS_ID,
  measures: [
    {
      id: TOTAL_MEASURE.id,
      name: TOTAL_MEASURE.name,
      isAdditive: true,
      dimensionIds: { [CREATED_AT_KEY]: "measure-dim-created-at" },
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
  ],
  segments: [],
};

const TIME_CARD: CubeCardModel = {
  id: "single:m100:field:1",
  kind: "single",
  series: [{ measureId: TOTAL_MEASURE.id, segmentIds: [] }],
  dimensionKeys: [CREATED_AT_KEY],
  display: "line",
};

const OVERVIEW_CARD: CubeCardModel = {
  id: "overview:m100",
  kind: "overview",
  series: [{ measureId: TOTAL_MEASURE.id, segmentIds: [] }],
  dimensionKeys: [],
  display: "scalar",
};

const GENERATOR: CardGenerator = {
  id: "test-generator",
  name: "Test",
  description: "Test generator",
  getDefaultSettings: () => ({
    measureIds: [TOTAL_MEASURE.id],
    dimensionKeys: [CREATED_AT_KEY],
    filterDimensionKeys: [],
  }),
  generateCards: () => [],
};

const NO_FILTERS: CubeFilters = { segmentIds: [], dimensionFilters: [] };

const DEFINITIONS = new Map([
  [TOTAL_MEASURE.id, setupMeasureDefinition(measureMetadata, TOTAL_MEASURE.id)],
]);

const LOADED_SERIES: UseCubeCardSeriesResult = {
  series: [
    createMockSingleSeries(
      { id: 1, name: TOTAL_MEASURE.name, display: "line" },
      {
        data: {
          cols: [
            createMockColumn({
              name: "CREATED_AT",
              base_type: "type/DateTime",
            }),
            createMockColumn({ name: "sum", base_type: "type/Float" }),
          ],
          rows: [["2024-01-01", 10]],
        },
      },
    ),
  ],
  display: "line",
  queriesAreLoading: false,
  queriesError: null,
};

function setup({
  card,
  filters = NO_FILTERS,
  seriesResult = LOADED_SERIES,
  displayOverrides = {},
}: {
  card: CubeCardModel;
  filters?: CubeFilters;
  seriesResult?: UseCubeCardSeriesResult;
  displayOverrides?: CubeViewerState["displayOverrides"];
}) {
  jest.mocked(useCubeCardSeries).mockReturnValue(seriesResult);

  const actions: CubeViewerActions = {
    applyCoarseSettings: jest.fn(),
    setCardDisplay: jest.fn(),
    addCard: jest.fn(),
    updateCard: jest.fn(),
    removeCard: jest.fn(),
    setFilters: jest.fn(),
    reset: jest.fn(),
  };
  const state: CubeViewerState = {
    generatorId: GENERATOR.id,
    mode: "coarse",
    settings: GENERATOR.getDefaultSettings(CATALOG),
    cards: [card],
    displayOverrides,
    filters,
  };
  renderWithProviders(
    <MetricCubeViewerProvider
      value={{
        catalog: CATALOG,
        definitions: DEFINITIONS,
        state,
        actions,
        generator: GENERATOR,
      }}
    >
      <CubeCard card={card} />
    </MetricCubeViewerProvider>,
  );

  return { actions };
}

describe("CubeCard", () => {
  it("renders the computed title and the chart", () => {
    setup({ card: TIME_CARD });

    expect(screen.getByText("Total Revenue by Created At")).toBeInTheDocument();
    expect(screen.getByTestId("visualization")).toBeInTheDocument();
  });

  it("offers the display types of the first dimension's type", () => {
    setup({ card: TIME_CARD });

    expect(screen.getByLabelText("line")).toBeInTheDocument();
    expect(screen.getByLabelText("area")).toBeInTheDocument();
    expect(screen.getByLabelText("bar")).toBeInTheDocument();
    expect(screen.queryByLabelText("scatter")).not.toBeInTheDocument();
  });

  it("passes the tile and override state to the series hook", () => {
    setup({ card: TIME_CARD });

    expect(useCubeCardSeries).toHaveBeenCalledWith(expect.anything(), "line", {
      id: TIME_CARD.id,
      title: "Total Revenue by Created At",
      isDisplayOverridden: false,
    });
  });

  it("marks a card the user re-styled as overridden", () => {
    setup({ card: TIME_CARD, displayOverrides: { [TIME_CARD.id]: "line" } });

    expect(useCubeCardSeries).toHaveBeenLastCalledWith(
      expect.anything(),
      "line",
      expect.objectContaining({ isDisplayOverridden: true }),
    );
  });

  it("shows the display the series were built with in the picker", () => {
    setup({
      card: TIME_CARD,
      seriesResult: { ...LOADED_SERIES, display: "bar" },
    });

    expect(screen.getByLabelText("bar")).toHaveAttribute(
      "data-variant",
      "filled",
    );
    expect(screen.getByLabelText("line")).toHaveAttribute(
      "data-variant",
      "subtle",
    );
  });

  it("changes the display through setCardDisplay without editing the card", async () => {
    const { actions } = setup({ card: TIME_CARD });

    await userEvent.click(screen.getByLabelText("bar"));

    expect(actions.setCardDisplay).toHaveBeenCalledWith(TIME_CARD.id, "bar");
    expect(actions.updateCard).not.toHaveBeenCalled();
  });

  it("changes the display without leaving coarse mode", async () => {
    jest.mocked(useCubeCardSeries).mockReturnValue(LOADED_SERIES);
    renderWithLiveViewer({
      catalog: CATALOG,
      generator: { ...GENERATOR, generateCards: () => [TIME_CARD] },
      definitions: DEFINITIONS,
      children: <CubeCard card={TIME_CARD} />,
    });
    expect(screen.getByTestId("viewer-mode")).toHaveTextContent("coarse");

    await userEvent.click(screen.getByLabelText("bar"));

    expect(screen.getByTestId("viewer-mode")).toHaveTextContent("coarse");
  });

  it("renders the actions slot in the header", () => {
    jest.mocked(useCubeCardSeries).mockReturnValue(LOADED_SERIES);
    renderWithLiveViewer({
      catalog: CATALOG,
      generator: GENERATOR,
      definitions: DEFINITIONS,
      children: (
        <CubeCard card={TIME_CARD} actions={<button>Card actions</button>} />
      ),
    });

    expect(
      screen.getByRole("button", { name: "Card actions" }),
    ).toBeInTheDocument();
  });

  it("hides the picker when there is only one display type", () => {
    setup({ card: OVERVIEW_CARD });

    expect(screen.getByText(TOTAL_MEASURE.name)).toBeInTheDocument();
    expect(screen.queryByLabelText("scalar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("line")).not.toBeInTheDocument();
  });

  it("shows the query error on the card", () => {
    setup({
      card: TIME_CARD,
      seriesResult: {
        series: [],
        display: "line",
        queriesAreLoading: false,
        queriesError: "Non-numeric metrics are not supported",
      },
    });

    expect(
      screen.getByText("Non-numeric metrics are not supported"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
  });

  it("shows the no-rows message when every series is empty", () => {
    setup({
      card: TIME_CARD,
      seriesResult: {
        ...LOADED_SERIES,
        series: [
          createMockSingleSeries(
            { id: 1, name: TOTAL_MEASURE.name, display: "line" },
            { data: { cols: LOADED_SERIES.series[0].data.cols, rows: [] } },
          ),
        ],
      },
    });

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("does not render the chart while the queries are loading", () => {
    setup({
      card: TIME_CARD,
      seriesResult: {
        series: [],
        display: "line",
        queriesAreLoading: true,
        queriesError: null,
      },
    });

    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
  });

  it("flags measures that a dimension filter does not apply to", () => {
    setup({
      card: TIME_CARD,
      filters: {
        segmentIds: [],
        dimensionFilters: [
          {
            dimensionKey: "field:99999",
            value: { type: "number", operator: ">", values: [5] },
          },
        ],
      },
    });

    expect(
      screen.getByLabelText(
        `Some filters don't apply to ${TOTAL_MEASURE.name}`,
      ),
    ).toBeInTheDocument();
  });
});
