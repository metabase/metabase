import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type { TestQuerySpec } from "metabase-types/api";
import {
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS_ID,
  REVIEWS_ID,
  createOrdersIdField,
  createOrdersProductIdField,
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import {
  compileGraph,
  createFilterNode,
  createJoinNode,
  createSortNode,
  createSummarizeNode,
  getUnsupportedReason,
  isValidConnection,
  seedGraph,
} from "./index";

const provider = createMetadataProvider();

function createQuery(spec: TestQuerySpec, metadataProvider = provider) {
  return Lib.createTestQuery(metadataProvider, spec);
}

// Seeds the canvas from a query and compiles it back, the way opening a
// question and letting the canvas sync does.
function roundTrip(query: Lib.Query, metadataProvider = provider) {
  const seed = seedGraph(query);
  const compiled = compileGraph(seed.nodes, seed.edges, () => metadataProvider);
  return { seed, compiled };
}

function expectRoundTrip(query: Lib.Query, metadataProvider = provider) {
  const { compiled } = roundTrip(query, metadataProvider);
  expect(compiled.error).toBeNull();
  expect(compiled.query).not.toBeNull();
  // Checked non-null just above.
  expect(Lib.toLegacyQuery(compiled.query as Lib.Query)).toEqual(
    Lib.toLegacyQuery(query),
  );
  return compiled;
}

const count = { type: "operator", operator: "count" } as const;

describe("seedGraph + compileGraph round trips", () => {
  it("a single table", () => {
    const query = createQuery({
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    });
    const { seed, compiled } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual(["table", "result"]);
    expect(compiled.error).toBeNull();
    // No error means the query is there.
    expect(Lib.toLegacyQuery(compiled.query as Lib.Query)).toEqual(
      Lib.toLegacyQuery(query),
    );
  });

  it("a table with some columns left out", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          fields: [
            { type: "column", name: "ID", tableId: ORDERS_ID },
            { type: "column", name: "TOTAL", tableId: ORDERS_ID },
          ],
        },
      ],
    });
    expectRoundTrip(query);
  });

  it("a join with suggested conditions", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          joins: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              strategy: "left-join",
            },
          ],
        },
      ],
    });
    const { seed } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual([
      "table",
      "table",
      "join",
      "result",
    ]);
    expectRoundTrip(query);
  });

  it("a chain of joins with different strategies", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: PRODUCTS_ID },
          joins: [
            {
              source: { type: "table", id: REVIEWS_ID },
              strategy: "left-join",
            },
            {
              source: { type: "table", id: ORDERS_ID },
              strategy: "right-join",
            },
          ],
        },
      ],
    });
    expectRoundTrip(query);
  });

  it("a join on a hand-picked condition", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          joins: [
            {
              source: { type: "table", id: PEOPLE_ID },
              strategy: "inner-join",
              conditions: [
                {
                  operator: "=",
                  left: { type: "column", name: "USER_ID", tableId: ORDERS_ID },
                  right: { type: "column", name: "ID", tableId: PEOPLE_ID },
                },
              ],
            },
          ],
        },
      ],
    });
    expectRoundTrip(query);
  });

  it("filters on source and joined columns", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          joins: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              strategy: "left-join",
            },
          ],
          filters: [
            {
              type: "operator",
              operator: ">",
              args: [
                { type: "column", name: "TOTAL", tableId: ORDERS_ID },
                { type: "literal", value: 50 },
              ],
            },
            {
              type: "operator",
              operator: "=",
              args: [
                { type: "column", name: "CATEGORY", tableId: PRODUCTS_ID },
                { type: "literal", value: "Gizmo" },
              ],
            },
          ],
        },
      ],
    });
    const { seed } = roundTrip(query);
    expect(seed.nodes.filter((node) => node.type === "filter")).toHaveLength(1);
    expectRoundTrip(query);
  });

  it("a summarize with a metric and a bucketed group", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [count],
          breakouts: [
            {
              type: "column",
              name: "CREATED_AT",
              tableId: ORDERS_ID,
              unit: "month",
            },
          ],
        },
      ],
    });
    expectRoundTrip(query);
  });

  it("a sort and a limit", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          orderBys: [{ type: "column", name: "TOTAL", tableId: ORDERS_ID }],
          limit: 25,
        },
      ],
    });
    const { seed } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual([
      "table",
      "sort",
      "limit",
      "result",
    ]);
    expectRoundTrip(query);
  });

  it("everything at once, in notebook order", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: PRODUCTS_ID },
          joins: [
            {
              source: { type: "table", id: REVIEWS_ID },
              strategy: "left-join",
            },
            {
              source: { type: "table", id: ORDERS_ID },
              strategy: "right-join",
            },
          ],
          filters: [
            {
              type: "operator",
              operator: ">",
              args: [
                { type: "column", name: "RATING", tableId: REVIEWS_ID },
                { type: "literal", value: 3 },
              ],
            },
          ],
          aggregations: [count],
          breakouts: [
            { type: "column", name: "CATEGORY", tableId: PRODUCTS_ID },
          ],
          orderBys: [
            { type: "column", name: "CATEGORY", tableId: PRODUCTS_ID },
          ],
          limit: 10,
        },
      ],
    });
    const { seed } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual([
      "table",
      "table",
      "join",
      "table",
      "join",
      "filter",
      "summarize",
      "sort",
      "limit",
      "result",
    ]);
    expectRoundTrip(query);
  });

  it("an empty query gives just the result block and no query", () => {
    const seed = seedGraph(
      Lib.createTestQuery(provider, {
        stages: [{ source: { type: "table", id: ORDERS_ID } }],
      }),
    );
    const compiled = compileGraph([seed.nodes[1]], [], () => provider);
    expect(compiled.query).toBeNull();
    expect(compiled.error).not.toBeNull();
  });
});

describe("custom column round trips", () => {
  const double = {
    name: "Double",
    value: {
      type: "operator",
      operator: "*",
      args: [
        { type: "column", name: "TOTAL", tableId: ORDERS_ID },
        { type: "literal", value: 2 },
      ],
    },
  } as const;

  it("a custom column and a filter on it", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [double],
          filters: [
            {
              type: "operator",
              operator: ">",
              args: [
                { type: "column", name: "Double" },
                { type: "literal", value: 100 },
              ],
            },
          ],
        },
      ],
    });
    const { seed } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual([
      "table",
      "expression",
      "filter",
      "result",
    ]);
    expectRoundTrip(query);
  });

  it("a custom column on the summarized results", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [count],
          breakouts: [
            {
              type: "column",
              name: "CREATED_AT",
              tableId: ORDERS_ID,
              unit: "month",
            },
          ],
        },
        {
          expressions: [
            {
              name: "Twice",
              value: {
                type: "operator",
                operator: "*",
                args: [
                  { type: "column", name: "count" },
                  { type: "literal", value: 2 },
                ],
              },
            },
          ],
        },
      ],
    });
    const { seed, compiled } = roundTrip(query);
    const expressionNode = seed.nodes.find(
      (node) => node.type === "expression",
    );
    expect(
      compiled.stagesByNodeId.get(expressionNode?.id ?? "")?.stageIndex,
    ).toBe(1);
    expectRoundTrip(query);
  });
});

describe("multi-stage round trips", () => {
  const byMonth = {
    type: "column",
    name: "CREATED_AT",
    tableId: ORDERS_ID,
    unit: "month",
  } as const;
  const countOver = (value: number) =>
    ({
      type: "operator",
      operator: ">",
      args: [
        { type: "column", name: "count" },
        { type: "literal", value },
      ],
    }) as const;

  it("a filter on the summarized results lands on the next stage", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [count],
          breakouts: [byMonth],
        },
        { filters: [countOver(10)] },
      ],
    });
    const { seed, compiled } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual([
      "table",
      "summarize",
      "filter",
      "result",
    ]);
    const filterNode = seed.nodes.find((node) => node.type === "filter");
    expect(compiled.stagesByNodeId.get(filterNode?.id ?? "")?.stageIndex).toBe(
      1,
    );
    expectRoundTrip(query);
  });

  it("sort and limit stay with their summarize, the filter goes after", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [count],
          breakouts: [byMonth],
          orderBys: [{ type: "column", name: "count" }],
          limit: 5,
        },
        { filters: [countOver(10)] },
      ],
    });
    const { seed } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual([
      "table",
      "summarize",
      "sort",
      "limit",
      "filter",
      "result",
    ]);
    expectRoundTrip(query);
  });

  it("a summarize of a summarize", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [count],
          breakouts: [byMonth],
        },
        { aggregations: [count] },
      ],
    });
    const { seed, compiled } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual([
      "table",
      "summarize",
      "summarize",
      "result",
    ]);
    // The round trip below fails first if the query is missing.
    expect(Lib.stageCount(compiled.query as Lib.Query)).toBe(2);
    expectRoundTrip(query);
  });

  it("three stages with a filter, a summarize and a sort on each", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          filters: [
            {
              type: "operator",
              operator: ">",
              args: [
                { type: "column", name: "TOTAL", tableId: ORDERS_ID },
                { type: "literal", value: 10 },
              ],
            },
          ],
          aggregations: [count],
          breakouts: [byMonth],
          orderBys: [{ type: "column", name: "count" }],
        },
        {
          filters: [countOver(3)],
          aggregations: [count],
        },
      ],
    });
    expectRoundTrip(query);
  });

  it("wires may cross into the next stage only after a summarize", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [count],
          breakouts: [byMonth],
          orderBys: [{ type: "column", name: "count" }],
        },
      ],
    });
    const { nodes, edges } = seedGraph(query);
    const [table, summarize, sort] = nodes;
    const filter = createFilterNode({ x: 0, y: 0 });
    const join = createJoinNode({ x: 0, y: 0 });
    const all = [...nodes, filter, join];
    const wire = (source: string, target: string, targetHandle = "in") =>
      isValidConnection(
        { source, sourceHandle: "out", target, targetHandle },
        all,
        edges,
      );
    // After a summarize, a filter or a join starts the next stage.
    expect(wire(summarize.id, filter.id)).toBe(true);
    expect(wire(sort.id, filter.id)).toBe(true);
    expect(wire(sort.id, join.id, "lhs")).toBe(true);
    // Without one, the stage order holds.
    expect(wire(table.id, filter.id)).toBe(true);
    expect(wire(sort.id, table.id)).toBe(false);
    expect(
      isValidConnection(
        {
          source: sort.id,
          sourceHandle: "out",
          target: filter.id,
          targetHandle: "in",
        },
        [table, createSortNode({ x: 0, y: 0 }), filter],
        [],
      ),
    ).toBe(false);
  });
});

describe("blocks off the result's path", () => {
  it("compile against their inputs without lighting up", () => {
    const query = createQuery({
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    });
    const seed = seedGraph(query);
    const table = seed.nodes[0];
    const summarize = createSummarizeNode({ x: 0, y: 0 });
    const compiled = compileGraph(
      [...seed.nodes, summarize],
      [
        ...seed.edges,
        {
          id: "side",
          source: table.id,
          sourceHandle: "out",
          target: summarize.id,
          targetHandle: "in",
        },
      ],
      () => provider,
    );
    expect(compiled.error).toBeNull();
    const stage = compiled.stagesByNodeId.get(summarize.id);
    expect(stage?.stageIndex).toBe(0);
    expect(stage && Lib.sourceTableOrCardId(stage.query)).toBe(ORDERS_ID);
    expect(compiled.activeNodeIds.has(summarize.id)).toBe(false);
    expect(compiled.activeNodeIds.has(table.id)).toBe(true);
  });

  it("still compile when nothing reaches the result", () => {
    const query = createQuery({
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    });
    const seed = seedGraph(query);
    const table = seed.nodes[0];
    const filter = createFilterNode({ x: 0, y: 0 });
    const compiled = compileGraph(
      [...seed.nodes, filter],
      [
        {
          id: "side",
          source: table.id,
          sourceHandle: "out",
          target: filter.id,
          targetHandle: "in",
        },
      ],
      () => provider,
    );
    expect(compiled.query).toBeNull();
    expect(compiled.error).not.toBeNull();
    expect(compiled.stagesByNodeId.has(filter.id)).toBe(true);
    expect(compiled.activeNodeIds.size).toBe(0);
  });
});

describe("getUnsupportedReason", () => {
  it("accepts what the canvas can hold", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          joins: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              strategy: "left-join",
            },
          ],
          aggregations: [count],
          breakouts: [
            { type: "column", name: "CATEGORY", tableId: PRODUCTS_ID },
          ],
          limit: 5,
        },
      ],
    });
    expect(getUnsupportedReason(query)).toBeNull();
  });

  it("accepts custom columns", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            {
              name: "Double",
              value: {
                type: "operator",
                operator: "*",
                args: [
                  { type: "column", name: "TOTAL", tableId: ORDERS_ID },
                  { type: "literal", value: 2 },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(getUnsupportedReason(query)).toBeNull();
  });

  it("accepts a stage after a summarize", () => {
    const query = createQuery({
      stages: [
        { source: { type: "table", id: ORDERS_ID }, aggregations: [count] },
        { limit: 3 },
      ],
    });
    expect(getUnsupportedReason(query)).toBeNull();
  });

  it("refuses a nested query that does not summarize first", () => {
    const query = createQuery({
      stages: [{ source: { type: "table", id: ORDERS_ID } }, { limit: 3 }],
    });
    expect(getUnsupportedReason(query)).toBe(
      "a nested query without a summarize",
    );
  });

  it("accepts a join after a summarize, on the next stage", () => {
    const query = createQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [count],
          breakouts: [
            { type: "column", name: "PRODUCT_ID", tableId: ORDERS_ID },
          ],
        },
        {
          joins: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              strategy: "left-join",
              conditions: [
                {
                  operator: "=",
                  left: { type: "column", name: "PRODUCT_ID" },
                  right: { type: "column", name: "ID", tableId: PRODUCTS_ID },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(getUnsupportedReason(query)).toBeNull();
    const { seed, compiled } = roundTrip(query);
    expect(seed.nodes.map((node) => node.type)).toEqual([
      "table",
      "summarize",
      "table",
      "join",
      "result",
    ]);
    const joinNode = seed.nodes.find((node) => node.type === "join");
    expect(compiled.joinIndexByNodeId.get(joinNode?.id ?? "")).toMatchObject({
      stageIndex: 1,
      joinIndex: 0,
    });
    expectRoundTrip(query);
  });

  it("ignores an empty trailing stage", () => {
    const query = Lib.appendStage(
      createQuery({
        stages: [
          { source: { type: "table", id: ORDERS_ID }, aggregations: [count] },
        ],
      }),
    );
    expect(Lib.stageCount(query)).toBe(2);
    expect(getUnsupportedReason(query)).toBeNull();
  });

  it("accepts a saved question as the source", () => {
    const card = createSavedStructuredCard({
      id: 7,
      result_metadata: [createOrdersIdField(), createOrdersProductIdField()],
    });
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [card],
    });
    const cardProvider = createMetadataProvider({ metadata });
    const query = createQuery(
      { stages: [{ source: { type: "card", id: card.id } }] },
      cardProvider,
    );
    expect(getUnsupportedReason(query)).toBeNull();
    const { seed } = roundTrip(query, cardProvider);
    expect(seed.nodes.map((node) => node.type)).toEqual(["table", "result"]);
    expectRoundTrip(query, cardProvider);
  });

  it("accepts a join to a saved question", () => {
    const card = createSavedStructuredCard({
      id: 7,
      result_metadata: [createOrdersIdField(), createOrdersProductIdField()],
    });
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [card],
    });
    const cardProvider = createMetadataProvider({ metadata });
    const query = createQuery(
      {
        stages: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            joins: [
              {
                source: { type: "card", id: card.id },
                strategy: "left-join",
              },
            ],
          },
        ],
      },
      cardProvider,
    );
    expect(getUnsupportedReason(query)).toBeNull();
    expectRoundTrip(query, cardProvider);
  });
});
