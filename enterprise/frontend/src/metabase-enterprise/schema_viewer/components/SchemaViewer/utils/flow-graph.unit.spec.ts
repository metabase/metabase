import type { ErdResponse } from "metabase-types/api";
import {
  createMockErdEdge,
  createMockErdField,
  createMockErdNode,
} from "metabase-types/api/mocks";

import { HEADER_HEIGHT_PX, ROW_HEIGHT_PX } from "../constants";

import { getNodeHeight, getNodeId, toFlowGraph } from "./flow-graph";

describe("getNodeId", () => {
  it("returns `table-${table_id}`", () => {
    expect(getNodeId({ table_id: 7 })).toBe("table-7");
  });
});

describe("getNodeHeight", () => {
  it("returns HEADER_HEIGHT + fieldCount * ROW_HEIGHT", () => {
    expect(getNodeHeight(0)).toBe(HEADER_HEIGHT_PX);
    expect(getNodeHeight(3)).toBe(HEADER_HEIGHT_PX + 3 * ROW_HEIGHT_PX);
  });
});

describe("toFlowGraph — field sort order", () => {
  it("places PK rows first, then FK rows, then everything else (preserving original order within categories)", () => {
    const response: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [
            createMockErdField({ id: 1, name: "extra_a", semantic_type: null }),
            createMockErdField({
              id: 2,
              name: "fk_b",
              semantic_type: "type/FK",
            }),
            createMockErdField({
              id: 3,
              name: "pk_c",
              semantic_type: "type/PK",
            }),
            createMockErdField({ id: 4, name: "extra_d", semantic_type: null }),
            createMockErdField({
              id: 5,
              name: "fk_e",
              semantic_type: "type/FK",
            }),
            createMockErdField({
              id: 6,
              name: "pk_f",
              semantic_type: "type/PK",
            }),
          ],
        }),
      ],
      edges: [],
    };

    const { nodes } = toFlowGraph(response);
    expect(nodes[0].data.fields.map((f) => f.name)).toEqual([
      "pk_c",
      "pk_f",
      "fk_b",
      "fk_e",
      "extra_a",
      "extra_d",
    ]);
  });
});

describe("toFlowGraph — edge ids and handles", () => {
  it("generates edge id from source and target field ids", () => {
    const response: ErdResponse = {
      nodes: [],
      edges: [createMockErdEdge({ source_field_id: 10, target_field_id: 20 })],
    };
    const { edges } = toFlowGraph(response);
    expect(edges[0].id).toBe("edge-10-20");
  });

  it("uses non-self-ref handles when source and target tables differ", () => {
    const response: ErdResponse = {
      nodes: [],
      edges: [createMockErdEdge({ source_table_id: 1, target_table_id: 2 })],
    };
    const { edges } = toFlowGraph(response);
    expect(edges[0].source).toBe("table-1");
    expect(edges[0].target).toBe("table-2");
    expect(edges[0].sourceHandle).toBe("field-10");
    expect(edges[0].targetHandle).toBe("field-20");
  });

  it("uses the right-side target handle for self-referential edges", () => {
    const response: ErdResponse = {
      nodes: [],
      edges: [
        createMockErdEdge({
          source_table_id: 1,
          target_table_id: 1,
          source_field_id: 10,
          target_field_id: 11,
        }),
      ],
    };
    const { edges } = toFlowGraph(response);
    expect(edges[0].source).toBe("table-1");
    expect(edges[0].target).toBe("table-1");
    expect(edges[0].targetHandle).toBe("field-11-right");
  });

  it("preserves the relationship value in the flow edge data", () => {
    const response: ErdResponse = {
      nodes: [],
      edges: [
        createMockErdEdge({
          relationship: "one-to-one",
          source_field_id: 1,
          target_field_id: 2,
        }),
        createMockErdEdge({
          relationship: "many-to-one",
          source_field_id: 3,
          target_field_id: 4,
        }),
      ],
    };
    const { edges } = toFlowGraph(response);
    expect(edges[0].data?.relationship).toBe("one-to-one");
    expect(edges[1].data?.relationship).toBe("many-to-one");
  });
});

describe("toFlowGraph — per-table edge roles", () => {
  it("populates sourceFieldIds, targetFieldIds, and selfRefTargetFieldIds correctly", () => {
    const response: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [createMockErdField({ id: 10 })],
        }),
        createMockErdNode({
          table_id: 2,
          fields: [createMockErdField({ id: 20 })],
        }),
      ],
      edges: [
        createMockErdEdge({
          source_table_id: 1,
          source_field_id: 10,
          target_table_id: 2,
          target_field_id: 20,
        }),
        createMockErdEdge({
          source_table_id: 2,
          source_field_id: 21,
          target_table_id: 2,
          target_field_id: 22,
        }),
      ],
    };
    const { nodes } = toFlowGraph(response);
    const t1 = nodes.find((n) => n.id === "table-1")!;
    const t2 = nodes.find((n) => n.id === "table-2")!;

    expect([...t1.data.sourceFieldIds]).toEqual([10]);
    expect([...t1.data.targetFieldIds]).toEqual([]);
    expect([...t1.data.selfRefTargetFieldIds]).toEqual([]);

    expect([...t2.data.sourceFieldIds]).toEqual([21]);
    expect([...t2.data.targetFieldIds]).toEqual([20]);
    expect([...t2.data.selfRefTargetFieldIds]).toEqual([22]);
  });
});

describe("toFlowGraph — memoization", () => {
  it("returns the same reference when called twice with deep-equal responses", () => {
    const responseA: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [createMockErdField({ id: 10 })],
        }),
      ],
      edges: [createMockErdEdge({ source_field_id: 10, target_field_id: 20 })],
    };
    const responseB: ErdResponse = JSON.parse(JSON.stringify(responseA));

    const a = toFlowGraph(responseA);
    const b = toFlowGraph(responseB);
    expect(a).toBe(b);
  });

  it("returns a different reference when an edge's relationship changes", () => {
    const responseA: ErdResponse = {
      nodes: [],
      edges: [createMockErdEdge({ relationship: "many-to-one" })],
    };
    const responseB: ErdResponse = {
      nodes: [],
      edges: [createMockErdEdge({ relationship: "one-to-one" })],
    };
    expect(toFlowGraph(responseA)).not.toBe(toFlowGraph(responseB));
  });
});
