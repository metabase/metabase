import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { getSankeyChartColumns, getSankeyData } from "./dataset";
import type { SankeyChartColumns } from "./types";

describe("getSankeyChartColumns", () => {
  const columns: DatasetColumn[] = [
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

  it("should return null when required settings are missing", () => {
    expect(getSankeyChartColumns(columns, {})).toBeNull();
    expect(
      getSankeyChartColumns(columns, {
        "sankey.source": "Source",
      }),
    ).toBeNull();
  });

  it("should return null when there is not enough columns even if settings are present", () => {
    expect(
      getSankeyChartColumns(columns.slice(0, 1), {
        "sankey.source": "Source",
        "sankey.target": "Target",
        "sankey.value": "Amount",
      }),
    ).toBeNull();
  });

  it("should return column descriptors when all required settings are present", () => {
    const result = getSankeyChartColumns(columns, {
      "sankey.source": "Source",
      "sankey.target": "Target",
      "sankey.value": "Amount",
    });

    expect(result).toEqual({
      source: expect.objectContaining({ index: 0 }),
      target: expect.objectContaining({ index: 1 }),
      value: expect.objectContaining({ index: 2 }),
    });
  });
});

describe("getSankeyData", () => {
  const columns: DatasetColumn[] = [
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
      semantic_type: "type/Number",
    }),
    createMockColumn({
      name: "Revenue",
      display_name: "Revenue",
      base_type: "type/Number",
      semantic_type: "type/Currency",
    }),
  ];

  const sankeyColumns: SankeyChartColumns = {
    source: { index: 0, column: columns[0] },
    target: { index: 1, column: columns[1] },
    value: { index: 2, column: columns[2] },
  };

  it("should create nodes and links with aggregated metrics", () => {
    const rawSeries = [
      {
        card: createMockCard({
          name: "Sankey card",
          display: "sankey",
        }),
        data: createMockDatasetData({
          rows: [
            ["A", "B", 10, 100],
            ["A", "B", 1, 10],
            ["B", "C", 20, 200],
            ["A", "C", 2, 20],
          ],
          cols: columns,
        }),
      },
    ];

    const result = getSankeyData(rawSeries, sankeyColumns);

    // Verify nodes
    expect(result.nodes).toHaveLength(3);

    // Node A
    const nodeA = result.nodes[0];
    expect(nodeA).toMatchObject({
      rawName: "A",
      level: 0,
      hasInputs: false,
      hasOutputs: true,
      inputColumnValues: {},
      outputColumnValues: {
        [getColumnKey(columns[0])]: "A",
        [getColumnKey(columns[1])]: "C",
        [getColumnKey(columns[2])]: 13,
        [getColumnKey(columns[3])]: 130,
      },
    });
    expect(nodeA.outputLinkByTarget.size).toBe(2);

    // Node B
    const nodeB = result.nodes[1];
    expect(nodeB).toMatchObject({
      rawName: "B",
      level: 1,
      hasInputs: true,
      hasOutputs: true,
      inputColumnValues: {
        [getColumnKey(columns[0])]: "A",
        [getColumnKey(columns[1])]: "B",
        [getColumnKey(columns[2])]: 11,
        [getColumnKey(columns[3])]: 110,
      },
      outputColumnValues: {
        [getColumnKey(columns[0])]: "B",
        [getColumnKey(columns[1])]: "C",
        [getColumnKey(columns[2])]: 20,
        [getColumnKey(columns[3])]: 200,
      },
    });
    expect(nodeB.outputLinkByTarget.size).toBe(1);

    // Node C
    const nodeC = result.nodes[2];
    expect(nodeC).toMatchObject({
      rawName: "C",
      level: 2,
      hasInputs: true,
      hasOutputs: false,
      inputColumnValues: {
        [getColumnKey(columns[0])]: "A",
        [getColumnKey(columns[1])]: "C",
        [getColumnKey(columns[2])]: 22,
        [getColumnKey(columns[3])]: 220,
      },
      outputColumnValues: {},
    });
    expect(nodeC.outputLinkByTarget.size).toBe(0);

    // Verify links
    expect(result.links).toHaveLength(3);

    // Link A->B
    expect(result.links[0]).toMatchObject({
      source: "A",
      target: "B",
      value: 11,
      columnValues: {
        [getColumnKey(columns[0])]: "A",
        [getColumnKey(columns[1])]: "B",
        [getColumnKey(columns[2])]: 11,
        [getColumnKey(columns[3])]: 110,
      },
    });
    expect(result.links[0].sourceNode).toBe(nodeA);
    expect(result.links[0].targetNode).toBe(nodeB);

    // Link B->C
    expect(result.links[1]).toMatchObject({
      source: "B",
      target: "C",
      value: 20,
      columnValues: {
        [getColumnKey(columns[0])]: "B",
        [getColumnKey(columns[1])]: "C",
        [getColumnKey(columns[2])]: 20,
        [getColumnKey(columns[3])]: 200,
      },
    });
    expect(result.links[1].sourceNode).toBe(nodeB);
    expect(result.links[1].targetNode).toBe(nodeC);

    // Link A->C
    expect(result.links[2]).toMatchObject({
      source: "A",
      target: "C",
      value: 2,
      columnValues: {
        [getColumnKey(columns[0])]: "A",
        [getColumnKey(columns[1])]: "C",
        [getColumnKey(columns[2])]: 2,
        [getColumnKey(columns[3])]: 20,
      },
    });
    expect(result.links[2].sourceNode).toBe(nodeA);
    expect(result.links[2].targetNode).toBe(nodeC);
  });
});
