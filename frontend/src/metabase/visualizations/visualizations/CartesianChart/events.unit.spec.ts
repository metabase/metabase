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
import {
  createMockColumn,
  createMockDatetimeColumn,
} from "metabase-types/api/mocks";

import { getEventDimensions } from "./events";

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
});
