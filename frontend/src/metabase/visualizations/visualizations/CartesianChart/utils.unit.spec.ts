import {
  createMockBreakoutSeriesModel,
  createMockCartesianChartModel,
  createMockSeriesModel,
} from "__support__/echarts";
import {
  INDEX_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getDatasetKey } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type { Datum } from "metabase/visualizations/echarts/cartesian/model/types";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { normalizeDimensionValue } from "./events";
import { getHoveredFromHighlighted } from "./utils";

const CARD_ID = 101;
const OTHER_CARD_ID = 202;

describe("getHoveredFromHighlighted", () => {
  const categoryColumn = createMockColumn({
    name: "CATEGORY",
    source: "breakout",
  });
  const sourceColumn = createMockColumn({
    name: "SOURCE",
    source: "breakout",
  });
  const sumColumn = createMockColumn({
    name: "sum",
    source: "aggregation",
  });
  const sum2Column = createMockColumn({
    name: "sum_2",
    source: "aggregation",
  });

  function makeChartModel({
    seriesModels,
    dataset,
    cardsColumns,
  }: {
    seriesModels: ReturnType<typeof createMockSeriesModel>[];
    dataset: Datum[];
    cardsColumns: any[];
  }) {
    return createMockCartesianChartModel({
      seriesModels,
      dataset,
      // Unjustified type cast. FIXME
      transformedDataset: dataset.map((datum, index) => ({
        ...datum,
        [INDEX_KEY]: index,
      })) as Datum[],
      dimensionModel: {
        column: categoryColumn,
        columnIndex: 0,
        columnByCardId: {
          [CARD_ID]: categoryColumn,
          [OTHER_CARD_ID]: categoryColumn,
        },
      },
      cardsColumns,
    });
  }

  it("resolves a single-series hover target from highlighted dimensions", () => {
    const dataKey = getDatasetKey(sumColumn, CARD_ID);
    const dataset: Datum[] = [
      {
        [X_AXIS_DATA_KEY]: "Gadget",
        [dataKey]: 10,
      },
      {
        [X_AXIS_DATA_KEY]: "Widget",
        [dataKey]: 15,
      },
    ];
    const seriesModel = createMockSeriesModel({
      dataKey,
      column: sumColumn,
      cardId: CARD_ID,
    });
    const chartModel = makeChartModel({
      seriesModels: [seriesModel],
      dataset,
      cardsColumns: [
        {
          dimension: { column: categoryColumn, index: 0 },
          metrics: [{ column: sumColumn, index: 1 }],
        },
      ],
    });
    const rawSeries = [createMockSingleSeries({ id: CARD_ID })];

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sumColumn.name,
          dimensions: [{ columnName: categoryColumn.name, value: "Gadget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toEqual({ index: 0, datumIndex: 0 });

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sumColumn.name,
          dimensions: [{ columnName: categoryColumn.name, value: "Widget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toEqual({ index: 0, datumIndex: 1 });
  });

  it("resolves breakout selections across multiple x-axis values", () => {
    const affiliateKey = getDatasetKey(sumColumn, CARD_ID, "Affiliate");
    const organicKey = getDatasetKey(sumColumn, CARD_ID, "Organic");
    const dataset: Datum[] = [
      {
        [X_AXIS_DATA_KEY]: "Gadget",
        [affiliateKey]: 10,
        [organicKey]: 20,
      },
      {
        [X_AXIS_DATA_KEY]: "Widget",
        [affiliateKey]: 11,
        [organicKey]: 21,
      },
    ];
    const affiliateSeries = createMockBreakoutSeriesModel({
      dataKey: affiliateKey,
      column: sumColumn,
      cardId: CARD_ID,
      breakoutColumn: sourceColumn,
      breakoutValue: "Affiliate",
    });
    const organicSeries = createMockBreakoutSeriesModel({
      dataKey: organicKey,
      column: sumColumn,
      cardId: CARD_ID,
      breakoutColumn: sourceColumn,
      breakoutValue: "Organic",
    });
    const chartModel = makeChartModel({
      seriesModels: [affiliateSeries, organicSeries],
      dataset,
      cardsColumns: [
        {
          dimension: { column: categoryColumn, index: 0 },
          breakout: { column: sourceColumn, index: 1 },
          metric: { column: sumColumn, index: 2 },
        },
      ],
    });
    const rawSeries = [createMockSingleSeries({ id: CARD_ID })];

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sumColumn.name,
          dimensions: [
            { columnName: categoryColumn.name, value: "Gadget" },
            { columnName: sourceColumn.name, value: "Affiliate" },
          ],
        },
        rawSeries,
        chartModel,
      ),
    ).toEqual({ index: 0, datumIndex: 0 });

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sumColumn.name,
          dimensions: [
            { columnName: categoryColumn.name, value: "Widget" },
            { columnName: sourceColumn.name, value: "Organic" },
          ],
        },
        rawSeries,
        chartModel,
      ),
    ).toEqual({ index: 1, datumIndex: 1 });
  });

  it("resolves multi-card selections across multiple x-axis values", () => {
    const card1Key = getDatasetKey(sumColumn, CARD_ID);
    const card2Key = getDatasetKey(sumColumn, OTHER_CARD_ID);
    const dataset: Datum[] = [
      {
        [X_AXIS_DATA_KEY]: "Gadget",
        [card1Key]: 10,
        [card2Key]: 30,
      },
      {
        [X_AXIS_DATA_KEY]: "Widget",
        [card1Key]: 15,
        [card2Key]: 35,
      },
    ];
    const card1Series = createMockSeriesModel({
      dataKey: card1Key,
      column: sumColumn,
      cardId: CARD_ID,
    });
    const card2Series = createMockSeriesModel({
      dataKey: card2Key,
      column: sumColumn,
      cardId: OTHER_CARD_ID,
    });
    const chartModel = makeChartModel({
      seriesModels: [card1Series, card2Series],
      dataset,
      cardsColumns: [
        {
          dimension: { column: categoryColumn, index: 0 },
          metrics: [{ column: sumColumn, index: 1 }],
        },
        {
          dimension: { column: categoryColumn, index: 0 },
          metrics: [{ column: sumColumn, index: 1 }],
        },
      ],
    });
    const rawSeries = [
      createMockSingleSeries({ id: CARD_ID }),
      createMockSingleSeries({ id: OTHER_CARD_ID }),
    ];

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sumColumn.name,
          dimensions: [{ columnName: categoryColumn.name, value: "Gadget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toEqual({ index: 0, datumIndex: 0 });

    expect(
      getHoveredFromHighlighted(
        {
          cardId: OTHER_CARD_ID,
          columnName: sumColumn.name,
          dimensions: [{ columnName: categoryColumn.name, value: "Widget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toEqual({ index: 1, datumIndex: 1 });
  });

  it("selects the correct metric in a multi-metric chart", () => {
    const sumKey = getDatasetKey(sumColumn, CARD_ID);
    const sum2Key = getDatasetKey(sum2Column, CARD_ID);
    const dataset: Datum[] = [
      {
        [X_AXIS_DATA_KEY]: "Gadget",
        [sumKey]: 10,
        [sum2Key]: 20,
      },
    ];
    const sumSeries = createMockSeriesModel({
      dataKey: sumKey,
      column: sumColumn,
      cardId: CARD_ID,
    });
    const sum2Series = createMockSeriesModel({
      dataKey: sum2Key,
      column: sum2Column,
      cardId: CARD_ID,
    });
    const chartModel = makeChartModel({
      seriesModels: [sumSeries, sum2Series],
      dataset,
      cardsColumns: [
        {
          dimension: { column: categoryColumn, index: 0 },
          metrics: [
            { column: sumColumn, index: 1 },
            { column: sum2Column, index: 2 },
          ],
        },
      ],
    });
    const rawSeries = [createMockSingleSeries({ id: CARD_ID })];

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sum2Column.name,
          dimensions: [{ columnName: categoryColumn.name, value: "Gadget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toEqual({ index: 1, datumIndex: 0 });
  });

  it("normalizes date dimensions when matching the x-axis value", () => {
    const createdAtColumn = createMockColumn({
      name: "CREATED_AT",
      source: "breakout",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
    });
    const dataKey = getDatasetKey(sumColumn, CARD_ID);
    const normalizedDate = normalizeDimensionValue(
      createdAtColumn,
      "2027-10-01T00:00:00Z",
    );
    const datum: Datum = {
      [X_AXIS_DATA_KEY]: "2027-10-01T00:00:00Z",
      [dataKey]: 10,
    };
    const seriesModel = createMockSeriesModel({
      dataKey,
      column: sumColumn,
      cardId: CARD_ID,
    });
    const chartModel = createMockCartesianChartModel({
      seriesModels: [seriesModel],
      dataset: [datum],
      // Unjustified type cast. FIXME
      transformedDataset: [
        { [X_AXIS_DATA_KEY]: "", [INDEX_KEY]: 0 },
      ] as Datum[],
      dimensionModel: {
        column: createdAtColumn,
        columnIndex: 0,
        columnByCardId: { [CARD_ID]: createdAtColumn },
      },
      cardsColumns: [
        {
          dimension: { column: createdAtColumn, index: 0 },
          metrics: [{ column: sumColumn, index: 1 }],
        },
      ],
    });
    const rawSeries = [createMockSingleSeries({ id: CARD_ID })];

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sumColumn.name,
          dimensions: [
            { columnName: createdAtColumn.name, value: normalizedDate },
          ],
        },
        rawSeries,
        chartModel,
      ),
    ).toEqual({ index: 0, datumIndex: 0 });
  });

  it("returns null when card, metric, breakout, or x-axis dimensions do not match", () => {
    const dataKey = getDatasetKey(sumColumn, CARD_ID);
    const datum: Datum = {
      [X_AXIS_DATA_KEY]: "Gadget",
      [dataKey]: 10,
    };
    const seriesModel = createMockSeriesModel({
      dataKey,
      column: sumColumn,
      cardId: CARD_ID,
    });
    const chartModel = makeChartModel({
      seriesModels: [seriesModel],
      dataset: [datum],
      cardsColumns: [
        {
          dimension: { column: categoryColumn, index: 0 },
          breakout: { column: sourceColumn, index: 1 },
          metric: { column: sumColumn, index: 2 },
        },
      ],
    });
    const rawSeries = [
      createMockSingleSeries({ id: CARD_ID }),
      createMockSingleSeries({ id: OTHER_CARD_ID }),
    ];

    expect(
      getHoveredFromHighlighted(
        {
          cardId: OTHER_CARD_ID,
          columnName: sumColumn.name,
          dimensions: [{ columnName: categoryColumn.name, value: "Gadget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toBeNull();

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: "missing-metric",
          dimensions: [{ columnName: categoryColumn.name, value: "Gadget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toBeNull();

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sumColumn.name,
          dimensions: [{ columnName: categoryColumn.name, value: "Widget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toBeNull();

    expect(
      getHoveredFromHighlighted(
        {
          cardId: CARD_ID,
          columnName: sumColumn.name,
          dimensions: [{ columnName: categoryColumn.name, value: "Gadget" }],
        },
        rawSeries,
        chartModel,
      ),
    ).toBeNull();
  });
});
