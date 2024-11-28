import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { createSankeyClickData } from "./events";

describe("createSankeyClickData", () => {
  const columns = [
    createMockColumn({
      name: "Source",
      display_name: "Source",
      base_type: "type/Text",
    }),
    createMockColumn({
      name: "Target",
      display_name: "Target",
      base_type: "type/Text",
    }),
    createMockColumn({
      name: "Amount",
      display_name: "Amount",
      base_type: "type/Number",
    }),
  ];

  const rawSeries = [
    {
      card: createMockCard(),
      data: createMockDatasetData({
        rows: [["A", "B", 10]],
        cols: columns,
      }),
    },
  ];

  const sankeyColumns = {
    source: { index: 0, column: columns[0] },
    target: { index: 1, column: columns[1] },
    value: { index: 2, column: columns[2] },
  };

  const settings = {};
  const mockEvent = {
    event: {
      event: new MouseEvent("click"),
    },
  } as unknown as EChartsSeriesMouseEvent["event"];

  it("should create click data for node events without inputs", () => {
    const nodeEvent = {
      dataType: "node",
      data: {
        rawName: "A",
        level: 0,
        hasInputs: false,
        hasOutputs: true,
        origin: "both" as const,
        inputColumnValues: {
          [getColumnKey(columns[0])]: "A",
          [getColumnKey(columns[1])]: "B",
          [getColumnKey(columns[2])]: 10,
        },
        outputColumnValues: {},
      },
      event: mockEvent,
      value: "A",
      seriesType: "sankey",
    };

    const clickData = createSankeyClickData(
      nodeEvent,
      sankeyColumns,
      rawSeries,
      settings,
    );

    expect(clickData).toEqual({
      event: mockEvent.event,
      settings,
      column: columns[0], // Use source column since node has no inputs
      value: "A",
      data: expect.arrayContaining([
        expect.objectContaining({ col: columns[0], value: "A" }),
        expect.objectContaining({ col: columns[1], value: "B" }),
      ]),
    });
  });

  it("should create click data for node events with inputs", () => {
    const nodeEvent = {
      dataType: "node",
      data: {
        rawName: "B",
        level: 1,
        hasInputs: true,
        hasOutputs: false,
        origin: "target" as const,
        inputColumnValues: {
          [getColumnKey(columns[0])]: "A",
          [getColumnKey(columns[1])]: "B",
          [getColumnKey(columns[2])]: 10,
        },
        outputColumnValues: {},
      },
      event: mockEvent,
      value: "B",
      seriesType: "sankey",
    };

    const clickData = createSankeyClickData(
      nodeEvent,
      sankeyColumns,
      rawSeries,
      settings,
    );

    expect(clickData).toEqual({
      event: mockEvent.event,
      settings,
      column: columns[1],
      value: "B",
      data: expect.arrayContaining([
        expect.objectContaining({ col: columns[0], value: "A" }),
        expect.objectContaining({ col: columns[1], value: "B" }),
      ]),
    });
  });

  it("should create click data for edge events", () => {
    const edgeEvent = {
      dataType: "edge",
      data: {
        source: "A",
        target: "B",
        value: 10,
        columnValues: {
          [getColumnKey(columns[0])]: "A",
          [getColumnKey(columns[1])]: "B",
          [getColumnKey(columns[2])]: 10,
        },
      },
      event: mockEvent,
      value: 10,
      seriesType: "sankey",
    };

    const clickData = createSankeyClickData(
      edgeEvent,
      sankeyColumns,
      rawSeries,
      settings,
    );

    expect(clickData).toEqual({
      event: mockEvent.event,
      settings,
      dimensions: [
        { column: columns[0], value: "A" },
        { column: columns[1], value: "B" },
      ],
      data: expect.arrayContaining([
        expect.objectContaining({ col: columns[0], value: "A" }),
        expect.objectContaining({ col: columns[1], value: "B" }),
        expect.objectContaining({ col: columns[2], value: 10 }),
      ]),
    });
  });
});
