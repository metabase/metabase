import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { useDefinitionQueries } from "metabase/metrics-viewer/hooks/use-definition-queries";
import {
  TOTAL_MEASURE,
  measureMetadata,
  setupMeasureDefinition,
} from "metabase/metrics-viewer/utils/__tests__/test-helpers";
import {
  type VizHeuristic,
  VizHeuristicProvider,
  type VizReport,
} from "metabase/visualizations/lib/viz-heuristics";
import type { CardDisplayType } from "metabase-types/api";
import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import type { CubeCard, CubeCatalog } from "../types";
import { cardToViewerModel } from "../utils/card-viewer-model";

import { type CubeCardTile, useCubeCardSeries } from "./use-cube-card-series";

jest.mock("metabase/metrics-viewer/hooks/use-definition-queries", () => ({
  useDefinitionQueries: jest.fn(),
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

const TIME_CARD: CubeCard = {
  id: "single:m100:field:1",
  kind: "single",
  series: [{ measureId: TOTAL_MEASURE.id, segmentIds: [] }],
  dimensionKeys: [CREATED_AT_KEY],
  display: "line",
};

const DEFINITIONS = new Map([
  [TOTAL_MEASURE.id, setupMeasureDefinition(measureMetadata, TOTAL_MEASURE.id)],
]);

const RESULT = createMockDataset({
  data: {
    cols: [
      createMockColumn({
        name: "CREATED_AT",
        display_name: "Created At",
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
        source: "breakout",
      }),
      createMockColumn({
        name: "sum",
        display_name: "Sum",
        base_type: "type/Float",
        effective_type: "type/Float",
        source: "aggregation",
      }),
    ],
    rows: [
      ["2024-01-01", 10],
      ["2024-02-01", 12],
    ],
  },
});

const TILE: CubeCardTile = {
  id: TIME_CARD.id,
  title: "Total Revenue by Created At",
  isDisplayOverridden: false,
};

function heuristicReturning(display: CardDisplayType): VizHeuristic {
  return {
    id: `always-${display}`,
    label: display,
    description: "",
    resolve: () => ({ display }),
  };
}

function setup({
  tile = TILE,
  heuristic,
  onReport,
}: {
  tile?: CubeCardTile;
  heuristic?: VizHeuristic;
  onReport?: (report: VizReport) => void;
} = {}) {
  jest.mocked(useDefinitionQueries).mockReturnValue({
    resultsByEntityIndex: new Map([[0, RESULT]]),
    breakoutValuesByEntityIndex: new Map(),
    modifiedDefinitionsBySlotIndex: new Map(),
    queriesAreLoading: false,
    queriesError: null,
  });
  const model = cardToViewerModel({
    card: TIME_CARD,
    catalog: CATALOG,
    definitions: DEFINITIONS,
    filters: { segmentIds: [], dimensionFilters: [] },
  });
  if (!model) {
    throw new Error("expected a viewer model");
  }

  const wrapper = heuristic
    ? ({ children }: { children: ReactNode }) => (
        <VizHeuristicProvider heuristic={heuristic} onReport={onReport}>
          {children}
        </VizHeuristicProvider>
      )
    : undefined;

  return renderHook(() => useCubeCardSeries(model, TIME_CARD.display, tile), {
    wrapper,
  });
}

describe("useCubeCardSeries", () => {
  it("builds the series with the card's display outside a provider", () => {
    const { result } = setup();

    expect(result.current.display).toBe("line");
    expect(result.current.series.map((s) => s.card.display)).toEqual(["line"]);
  });

  it("uses the heuristic's display inside a provider and reports it", () => {
    const onReport = jest.fn();
    const { result } = setup({
      heuristic: heuristicReturning("bar"),
      onReport,
    });

    expect(result.current.display).toBe("bar");
    expect(result.current.series.map((s) => s.card.display)).toEqual(["bar"]);
    expect(onReport).toHaveBeenCalledWith({
      tileId: TIME_CARD.id,
      title: TILE.title,
      display: "bar",
      hintDisplay: "line",
      heuristicId: "always-bar",
    });
  });

  it("keeps the card's display when the user overrode it", () => {
    const { result } = setup({
      heuristic: heuristicReturning("bar"),
      tile: { ...TILE, isDisplayOverridden: true },
    });

    expect(result.current.display).toBe("line");
  });

  it("keeps the card's display when the heuristic picks a display the dimension type does not offer", () => {
    const { result } = setup({ heuristic: heuristicReturning("pie") });

    expect(result.current.display).toBe("line");
  });
});
