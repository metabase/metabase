import { getDataFromClicked } from "metabase/value-formatting";
import type { EChartsSeriesMouseEvent } from "metabase/viz-core";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import {
  createMockCard,
  createMockNativeCard,
} from "metabase-types/api/mocks/card";
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
    createMockColumn({
      name: "Raw Vendor",
      display_name: "Raw Vendor",
      base_type: "type/Text",
    }),
  ];

  const rawSeries = [
    {
      card: createMockCard(),
      data: createMockDatasetData({
        rows: [["A", "B", 10, "Vendor 1"]],
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
  // Unjustified type cast. FIXME
  const mockEvent = {
    event: {
      event: new MouseEvent("click"),
    },
  } as unknown as EChartsSeriesMouseEvent["event"];

  it("should create click data for node events without inputs (#72932)", () => {
    const nodeEvent = {
      dataType: "node",
      data: {
        rawName: "A",
        displayName: "A",
        level: 0,
        hasInputs: false,
        hasOutputs: true,
        origin: "both" as const,
        inputColumnValues: {},
        outputColumnValues: {
          [getColumnKey(columns[0])]: "A",
          [getColumnKey(columns[1])]: "B",
          [getColumnKey(columns[2])]: 10,
          [getColumnKey(columns[3])]: "Vendor 1",
        },
        outputLinkByTarget: new Map(),
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
        expect.objectContaining({ col: columns[1], value: "A" }),
        expect.objectContaining({ col: columns[2], value: 10 }),
        expect.objectContaining({ col: columns[3], value: "Vendor 1" }),
      ]),
    });
    expect(clickData?.data).toHaveLength(columns.length);
  });

  it("should create click data for node events with inputs (#72932)", () => {
    const nodeEvent = {
      dataType: "node",
      data: {
        rawName: "B",
        displayName: "B",
        level: 1,
        hasInputs: true,
        hasOutputs: false,
        origin: "target" as const,
        inputColumnValues: {
          [getColumnKey(columns[0])]: "A",
          [getColumnKey(columns[1])]: "B",
          [getColumnKey(columns[2])]: 10,
          [getColumnKey(columns[3])]: "Vendor 1",
        },
        outputColumnValues: {},
        outputLinkByTarget: new Map(),
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
        expect.objectContaining({ col: columns[0], value: "B" }),
        expect.objectContaining({ col: columns[1], value: "B" }),
        expect.objectContaining({ col: columns[2], value: 10 }),
        expect.objectContaining({ col: columns[3], value: "Vendor 1" }),
      ]),
    });
    expect(clickData?.data).toHaveLength(columns.length);
  });

  it("should create click data for edge events", () => {
    const sourceNode = {
      rawName: "A",
      displayName: "A",
      level: 0,
      hasInputs: false,
      hasOutputs: true,
      inputColumnValues: {},
      outputColumnValues: {},
      outputLinkByTarget: new Map(),
    };

    const targetNode = {
      rawName: "B",
      displayName: "B",
      level: 1,
      hasInputs: true,
      hasOutputs: false,
      inputColumnValues: {},
      outputColumnValues: {},
      outputLinkByTarget: new Map(),
    };

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
          [getColumnKey(columns[3])]: "Vendor 1",
        },
        sourceNode,
        targetNode,
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
        expect.objectContaining({ col: columns[3], value: "Vendor 1" }),
      ]),
    });
    expect(clickData?.data).toHaveLength(columns.length);
  });

  it("should create click data for native query edge events (#72932)", () => {
    const sourceNode = {
      rawName: "A",
      displayName: "A",
      level: 0,
      hasInputs: false,
      hasOutputs: true,
      inputColumnValues: {},
      outputColumnValues: {},
      outputLinkByTarget: new Map(),
    };

    const targetNode = {
      rawName: "B",
      displayName: "B",
      level: 1,
      hasInputs: true,
      hasOutputs: false,
      inputColumnValues: {},
      outputColumnValues: {},
      outputLinkByTarget: new Map(),
    };

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
          [getColumnKey(columns[3])]: "Vendor 1",
        },
        sourceNode,
        targetNode,
      },
      event: mockEvent,
      value: 10,
      seriesType: "sankey",
    };

    const nativeRawSeries = [
      {
        ...rawSeries[0],
        card: createMockNativeCard(),
      },
    ];

    const clickData = createSankeyClickData(
      edgeEvent,
      sankeyColumns,
      nativeRawSeries,
      settings,
    );

    expect(clickData).toEqual({
      event: mockEvent.event,
      settings,
      data: expect.arrayContaining([
        expect.objectContaining({ col: columns[0], value: "A" }),
        expect.objectContaining({ col: columns[1], value: "B" }),
        expect.objectContaining({ col: columns[2], value: 10 }),
        expect.objectContaining({ col: columns[3], value: "Vendor 1" }),
      ]),
    });
    expect(clickData?.data).toHaveLength(columns.length);
  });

  // Node column values are accumulated per role (source rows -> outputColumnValues,
  // target rows -> inputColumnValues), so a click-behavior lookup by column name
  // must not fall through to them — it would return a neighbour's name.
  describe("node click resolves to the clicked node for both mapped columns (#78113)", () => {
    const SOURCE_KEY = getColumnKey(columns[0]);
    const TARGET_KEY = getColumnKey(columns[1]);
    const AMOUNT_KEY = getColumnKey(columns[2]);

    const lookupValue = (
      clickData: ReturnType<typeof createSankeyClickData>,
      columnName: string,
    ) => {
      const { column } = getDataFromClicked({
        dimensions: clickData?.dimensions,
        data: clickData?.data,
      });
      return column[columnName.toLowerCase()]?.value;
    };

    it("start-node click mapped to the Target column returns the clicked node, not its downstream neighbour", () => {
      const startANode = {
        dataType: "node",
        data: {
          rawName: "Start A",
          displayName: "Start A",
          level: 0,
          hasInputs: false,
          hasOutputs: true,
          origin: "source" as const,
          inputColumnValues: {},
          outputColumnValues: {
            [SOURCE_KEY]: "Start A",
            [TARGET_KEY]: "Middle X",
            [AMOUNT_KEY]: 1,
          },
          outputLinkByTarget: new Map(),
        },
        event: mockEvent,
        value: "Start A",
        seriesType: "sankey",
      };

      const clickData = createSankeyClickData(
        startANode,
        sankeyColumns,
        rawSeries,
        settings,
      );

      expect(lookupValue(clickData, "Source")).toBe("Start A");
      expect(lookupValue(clickData, "Target")).toBe("Start A");
    });

    it("receiving-node click mapped to the Source column returns the clicked node, not an upstream neighbour", () => {
      const middleXNode = {
        dataType: "node",
        data: {
          rawName: "Middle X",
          displayName: "Middle X",
          level: 1,
          hasInputs: true,
          hasOutputs: true,
          origin: "both" as const,
          inputColumnValues: {
            [SOURCE_KEY]: "Start B",
            [TARGET_KEY]: "Middle X",
            [AMOUNT_KEY]: 3,
          },
          outputColumnValues: {
            [SOURCE_KEY]: "Middle X",
            [TARGET_KEY]: "End",
            [AMOUNT_KEY]: 3,
          },
          outputLinkByTarget: new Map(),
        },
        event: mockEvent,
        value: "Middle X",
        seriesType: "sankey",
      };

      const clickData = createSankeyClickData(
        middleXNode,
        sankeyColumns,
        rawSeries,
        settings,
      );

      expect(lookupValue(clickData, "Target")).toBe("Middle X");
      expect(lookupValue(clickData, "Source")).toBe("Middle X");
    });
  });
});
