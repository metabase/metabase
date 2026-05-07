import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  BaseCartesianChartModel,
  BreakoutSeriesModel,
  Datum,
  DimensionModel,
  ScatterSeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { DatasetColumn } from "metabase-types/api";

import { getEventDimensions } from "./events";

const CARD_ID = 107;

const createdAtColumn = {
  name: "CREATED_AT",
  display_name: "Created At: Month",
  source: "breakout",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
  semantic_type: "type/CreationTimestamp",
} as DatasetColumn;

const sourceColumn = {
  name: "SOURCE",
  display_name: "User → Source",
  source: "breakout",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Source",
} as DatasetColumn;

const sumColumn = {
  name: "sum",
  display_name: "Sum of Total",
  source: "aggregation",
  base_type: "type/Float",
  effective_type: "type/Float",
} as DatasetColumn;

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

    const chartModel = {
      columnByDataKey: {
        [createdAtKey]: createdAtColumn,
        [sourceKey]: sourceColumn,
        [sumKey]: sumColumn,
      },
    } as unknown as BaseCartesianChartModel;

    // Scatter series model without `breakoutColumn`: this is what happens when graph.dimensions
    // has only the X-axis column even though the underlying query has a second breakout.
    const seriesModel = {
      name: "Sum of Total",
      color: "#509EE3",
      dataKey: sumKey,
      visible: true,
      column: sumColumn,
      columnIndex: 2,
      cardId: CARD_ID,
      vizSettingsKey: "sum",
      legacySeriesSettingsObjectKey: { vizSettingsKey: "sum" },
      tooltipName: "Sum of Total",
    } as unknown as ScatterSeriesModel;

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
    const monthColumn = {
      ...createdAtColumn,
      name: "CREATED_AT",
      display_name: "Created At: Month",
      unit: "month",
    } as DatasetColumn;

    const yearColumn = {
      ...createdAtColumn,
      name: "CREATED_AT_2",
      display_name: "Created At: Year",
      unit: "year",
    } as DatasetColumn;

    const monthKey = `${CARD_ID}:CREATED_AT`;
    const yearKey = `${CARD_ID}:CREATED_AT_2`;
    const sumKey = `${CARD_ID}:sum`;

    const datum: Datum = {
      [X_AXIS_DATA_KEY]: "2027-10-01T00:00:00Z",
      [monthKey]: "2027-10-01T00:00:00Z",
      [yearKey]: "2027-01-01T00:00:00Z",
      [sumKey]: 6720.6432478784345,
    };

    const chartModel = {
      columnByDataKey: {
        [monthKey]: monthColumn,
        [yearKey]: yearColumn,
        [sumKey]: sumColumn,
      },
    } as unknown as BaseCartesianChartModel;

    const dimensionModelMonthAxis: DimensionModel = {
      column: monthColumn,
      columnIndex: 0,
      columnByCardId: { [CARD_ID]: monthColumn },
    };

    const seriesModel = {
      name: "Sum of Total",
      color: "#509EE3",
      dataKey: sumKey,
      visible: true,
      column: sumColumn,
      columnIndex: 2,
      cardId: CARD_ID,
      vizSettingsKey: "sum",
      legacySeriesSettingsObjectKey: { vizSettingsKey: "sum" },
      tooltipName: "Sum of Total",
    } as unknown as ScatterSeriesModel;

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

    const chartModel = {
      columnByDataKey: {
        [createdAtKey]: createdAtColumn,
        [sourceKey]: sourceColumn,
        [sumKey]: sumColumn,
      },
    } as unknown as BaseCartesianChartModel;

    // Scatter series model WITH breakoutColumn (the working case where series/color is set).
    const seriesModel = {
      name: "Affiliate",
      color: "#509EE3",
      dataKey: sumKey,
      visible: true,
      column: sumColumn,
      columnIndex: 2,
      cardId: CARD_ID,
      vizSettingsKey: "Affiliate",
      legacySeriesSettingsObjectKey: { vizSettingsKey: "Affiliate" },
      tooltipName: "Sum of Total",
      breakoutColumn: sourceColumn,
      breakoutColumnIndex: 1,
      breakoutValue: "Affiliate",
    } as unknown as BreakoutSeriesModel;

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
