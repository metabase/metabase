import {
  createMockBreakoutSeriesModel,
  createMockCartesianChartModel,
  createMockSeriesModel,
} from "__support__/echarts";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  Datum,
  DimensionModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  createMockColumn,
  createMockDatetimeColumn,
  createMockSingleSeries,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import {
  canBrush,
  getEventDimensions,
  getTimelineEventsForEvent,
} from "./events";

const CARD_ID = 107;

const createdAtColumn = createMockDatetimeColumn({
  name: "CREATED_AT",
  display_name: "Created At: Month",
  source: "breakout",
  semantic_type: "type/CreationTimestamp",
});

const sourceColumn = createMockColumn({
  name: "SOURCE",
  display_name: "User → Source",
  source: "breakout",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Source",
});

const sumColumn = createMockColumn({
  name: "sum",
  display_name: "Sum of Total",
  source: "aggregation",
  base_type: "type/Float",
  effective_type: "type/Float",
});

const dimensionModel: DimensionModel = {
  column: createdAtColumn,
  columnIndex: 0,
  columnByCardId: { [CARD_ID]: createdAtColumn },
};

describe("getEventDimensions", () => {
  // Reproduces issue #73803: a scatterplot with two breakouts (a temporal X-axis and a categorical
  // breakout) must surface ALL breakout dimensions on the click context, even when the categorical
  // breakout isn't bound to series/color in viz settings. Previously only the X-axis dimension was
  // included, so "See these records" dropped the categorical filter from the drill-thru query. (#73803)
  it("includes all breakout columns when a scatterplot's categorical breakout is not bound to series/color (#73803)", () => {
    const createdAtKey = `${CARD_ID}:CREATED_AT`;
    const sourceKey = `${CARD_ID}:SOURCE`;
    const sumKey = `${CARD_ID}:sum`;

    const datum: Datum = {
      [X_AXIS_DATA_KEY]: "2027-10-01T00:00:00Z",
      [createdAtKey]: "2027-10-01T00:00:00Z",
      [sourceKey]: "Affiliate",
      [sumKey]: 6720.6432478784345,
    };

    const chartModel = createMockCartesianChartModel({
      columnByDataKey: {
        [createdAtKey]: createdAtColumn,
        [sourceKey]: sourceColumn,
        [sumKey]: sumColumn,
      },
    });

    // Scatter series model without `breakoutColumn`: this is what happens when graph.dimensions
    // has only the X-axis column even though the underlying query has a second breakout.
    const seriesModel = createMockSeriesModel({
      dataKey: sumKey,
      column: sumColumn,
      columnIndex: 2,
      cardId: CARD_ID,
      vizSettingsKey: "sum",
    });

    const dimensions = getEventDimensions(
      chartModel,
      datum,
      dimensionModel,
      seriesModel,
    );

    expect(dimensions).toEqual([
      { column: createdAtColumn, value: "2027-10-01T00:00:00" },
      { column: sourceColumn, value: "Affiliate" },
    ]);
  });

  // The same field can be broken out twice with different temporal units (e.g. CREATED_AT bucketed
  // by month AND year). The result columns are deduplicated to "CREATED_AT" and "CREATED_AT_2",
  // each becoming a separate DatasetColumn — so both should land in dimensions, even though they
  // point at the same underlying field.
  it("includes both breakouts when the same field is broken out twice with different temporal units", () => {
    const monthColumn = createMockDatetimeColumn({
      name: "CREATED_AT",
      display_name: "Created At: Month",
      source: "breakout",
      semantic_type: "type/CreationTimestamp",
      unit: "month",
    });

    const yearColumn = createMockDatetimeColumn({
      name: "CREATED_AT_2",
      display_name: "Created At: Year",
      source: "breakout",
      semantic_type: "type/CreationTimestamp",
      unit: "year",
    });

    const monthKey = `${CARD_ID}:CREATED_AT`;
    const yearKey = `${CARD_ID}:CREATED_AT_2`;
    const sumKey = `${CARD_ID}:sum`;

    const datum: Datum = {
      [X_AXIS_DATA_KEY]: "2027-10-01T00:00:00Z",
      [monthKey]: "2027-10-01T00:00:00Z",
      [yearKey]: "2027-01-01T00:00:00Z",
      [sumKey]: 6720.6432478784345,
    };

    const chartModel = createMockCartesianChartModel({
      columnByDataKey: {
        [monthKey]: monthColumn,
        [yearKey]: yearColumn,
        [sumKey]: sumColumn,
      },
    });

    const dimensionModelMonthAxis: DimensionModel = {
      column: monthColumn,
      columnIndex: 0,
      columnByCardId: { [CARD_ID]: monthColumn },
    };

    const seriesModel = createMockSeriesModel({
      dataKey: sumKey,
      column: sumColumn,
      columnIndex: 2,
      cardId: CARD_ID,
      vizSettingsKey: "sum",
    });

    const dimensions = getEventDimensions(
      chartModel,
      datum,
      dimensionModelMonthAxis,
      seriesModel,
    );

    expect(dimensions).toEqual([
      { column: monthColumn, value: "2027-10-01T00:00:00" },
      { column: yearColumn, value: "2027-01-01T00:00:00Z" },
    ]);
  });

  it("does not duplicate the breakout column already provided by seriesModel.breakoutColumn", () => {
    const createdAtKey = `${CARD_ID}:CREATED_AT:Affiliate`;
    const sourceKey = `${CARD_ID}:SOURCE:Affiliate`;
    const sumKey = `${CARD_ID}:sum:Affiliate`;

    const datum: Datum = {
      [X_AXIS_DATA_KEY]: "2027-10-01T00:00:00Z",
      [createdAtKey]: "2027-10-01T00:00:00Z",
      [sourceKey]: "Affiliate",
      [sumKey]: 6720.6432478784345,
    };

    const chartModel = createMockCartesianChartModel({
      columnByDataKey: {
        [createdAtKey]: createdAtColumn,
        [sourceKey]: sourceColumn,
        [sumKey]: sumColumn,
      },
    });

    // Series model WITH breakoutColumn (the working case where series/color is set).
    const seriesModel = createMockBreakoutSeriesModel({
      dataKey: sumKey,
      column: sumColumn,
      columnIndex: 2,
      cardId: CARD_ID,
      vizSettingsKey: "Affiliate",
      breakoutColumn: sourceColumn,
      breakoutColumnIndex: 1,
      breakoutValue: "Affiliate",
    });

    const dimensions = getEventDimensions(
      chartModel,
      datum,
      dimensionModel,
      seriesModel,
    );

    expect(dimensions).toEqual([
      { column: createdAtColumn, value: "2027-10-01T00:00:00" },
      { column: sourceColumn, value: "Affiliate" },
    ]);
  });

  it("includes the x-axis breakout when clicking a bar with only metric data (#73448)", () => {
    const categoryColumn = createMockColumn({
      name: "CATEGORY",
      display_name: "Product → Category",
      source: "breakout",
      base_type: "type/Text",
      effective_type: "type/Text",
    });
    const countColumn = createMockColumn({
      name: "count",
      display_name: "Count",
      source: "aggregation",
      base_type: "type/BigInteger",
      effective_type: "type/BigInteger",
    });
    const countKey = `${CARD_ID}:count`;
    const datum: Datum = {
      [X_AXIS_DATA_KEY]: "Doohickey",
      [countKey]: 3976,
    };
    const chartModel = createMockCartesianChartModel({
      columnByDataKey: {
        [countKey]: countColumn,
      },
    });
    const categoryDimensionModel: DimensionModel = {
      column: categoryColumn,
      columnIndex: 0,
      columnByCardId: { [CARD_ID]: categoryColumn },
    };
    const seriesModel = createMockSeriesModel({
      dataKey: countKey,
      column: countColumn,
      columnIndex: 1,
      cardId: CARD_ID,
      vizSettingsKey: "count",
    });

    const dimensions = getEventDimensions(
      chartModel,
      datum,
      categoryDimensionModel,
      seriesModel,
    );

    expect(dimensions).toEqual([
      { column: categoryColumn, value: "Doohickey" },
    ]);
  });
});

describe("canBrush", () => {
  const productIdColumn = createMockColumn({
    name: "PRODUCT_ID",
    display_name: "Product ID",
    source: "breakout",
    base_type: "type/Integer",
    effective_type: "type/Integer",
  });

  const sumSubtotalColumn = createMockColumn({
    name: "sum",
    display_name: "Sum of Subtotal",
    source: "aggregation",
    base_type: "type/Float",
    effective_type: "type/Float",
  });

  const sumTotalColumn = createMockColumn({
    name: "sum_2",
    display_name: "Sum of Total",
    source: "aggregation",
    base_type: "type/Float",
    effective_type: "type/Float",
  });

  const baseSettings: ComputedVisualizationSettings = {
    "graph.x_axis.scale": "linear",
  };

  const onChangeCardAndRun = jest.fn();

  // Reproduces UXW-3333 (metabase#71073): a scatter chart with aggregations on
  // both axes ends up with `dimensionModel.column.source === "aggregation"`.
  // The brush-to-filter handler can't safely filter an aggregation in the same
  // stage that produces it (the resulting MBQL is rejected by the QP), so brush
  // must be disabled in this configuration.
  it("returns false when the x-axis dimension is an aggregation column (metabase#71073)", () => {
    const series = [
      createMockSingleSeries(
        {},
        {
          data: { cols: [sumSubtotalColumn, sumTotalColumn, productIdColumn] },
        },
      ),
    ];

    expect(
      canBrush(series, baseSettings, sumSubtotalColumn, onChangeCardAndRun),
    ).toBe(false);
  });

  it("returns true when the x-axis dimension is a breakout column", () => {
    const series = [
      createMockSingleSeries(
        {},
        { data: { cols: [productIdColumn, sumSubtotalColumn] } },
      ),
    ];

    expect(
      canBrush(series, baseSettings, productIdColumn, onChangeCardAndRun),
    ).toBe(true);
  });

  // External `onBrush` consumers (e.g. MetricsViewer) handle the range
  // themselves and never produce an aggregation-on-aggregation filter, so brush
  // should remain enabled even when the x-axis dimension is an aggregation.
  it("returns true for external onBrush even when the x-axis is an aggregation", () => {
    const series = [
      createMockSingleSeries(
        {},
        {
          data: { cols: [sumSubtotalColumn, sumTotalColumn, productIdColumn] },
        },
      ),
    ];
    const onBrush = jest.fn();

    expect(
      canBrush(series, baseSettings, sumSubtotalColumn, undefined, onBrush),
    ).toBe(true);
  });
});

describe("getTimelineEventsForEvent", () => {
  const timelineEventsModel: TimelineEventsModel = [
    {
      date: "2027-10-01T00:00:00Z",
      events: [createMockTimelineEvent({ id: 1, name: "RC1" })],
    },
    {
      date: "2027-11-01T00:00:00Z",
      events: [createMockTimelineEvent({ id: 2, name: "RC2" })],
    },
  ];

  it("finds events by event.value", () => {
    const event = {
      value: "2027-10-01T00:00:00Z",
      data: null,
    } as unknown as EChartsSeriesMouseEvent;

    const result = getTimelineEventsForEvent(timelineEventsModel, event);
    expect(result).toEqual(timelineEventsModel[0].events);
  });

  it("finds events by event.data.xAxis when value is not populated (stacked series) #74005", () => {
    const event = {
      value: undefined,
      data: { xAxis: "2027-10-01T00:00:00Z" },
    } as unknown as EChartsSeriesMouseEvent;

    const result = getTimelineEventsForEvent(timelineEventsModel, event);
    expect(result).toEqual(timelineEventsModel[0].events);
  });

  it("returns undefined when no matching date exists", () => {
    const event = {
      value: "9999-01-01T00:00:00Z",
      data: null,
    } as unknown as EChartsSeriesMouseEvent;

    expect(
      getTimelineEventsForEvent(timelineEventsModel, event),
    ).toBeUndefined();
  });
});
