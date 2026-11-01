import { Position } from "@xyflow/react";

import type { ErdResponse } from "metabase-types/api";
import {
  createMockErdEdge,
  createMockErdField,
  createMockErdNode,
} from "metabase-types/api/mocks";

import { HEADER_HEIGHT_PX, NODE_WIDTH_PX, ROW_HEIGHT_PX } from "../constants";
import type { SchemaViewerFlowNode } from "../types";

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

describe("toFlowGraph — linked foreign key rows", () => {
  it("groups FKs with a known target right after the PKs and records their row range", () => {
    const response: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [
            createMockErdField({ id: 1, name: "extra", semantic_type: null }),
            createMockErdField({
              id: 2,
              name: "fk_hidden_target",
              semantic_type: "type/FK",
              fk_target_table_id: null,
            }),
            createMockErdField({
              id: 3,
              name: "fk_linked_a",
              semantic_type: "type/FK",
              fk_target_table_id: 7,
            }),
            createMockErdField({ id: 4, name: "pk", semantic_type: "type/PK" }),
            createMockErdField({
              id: 5,
              name: "fk_linked_b",
              semantic_type: "type/FK",
              fk_target_table_id: 8,
            }),
          ],
        }),
      ],
      edges: [],
    };

    const [node] = toFlowGraph(response).nodes;

    expect(node.data.fields.map((f) => f.name)).toEqual([
      "pk",
      "fk_linked_a",
      "fk_linked_b",
      "fk_hidden_target",
      "extra",
    ]);
    expect(node.data.linkedForeignKeyRows).toEqual({ start: 1, count: 2 });
  });
});

describe("toFlowGraph — fixed node and handle geometry", () => {
  it("declares dimensions and positions handles from sorted field rows", () => {
    const response: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [
            createMockErdField({ id: 11, semantic_type: null }),
            createMockErdField({ id: 12, semantic_type: "type/FK" }),
            createMockErdField({ id: 13, semantic_type: "type/PK" }),
          ],
        }),
        createMockErdNode({
          table_id: 2,
          fields: [createMockErdField({ id: 21, semantic_type: "type/PK" })],
        }),
      ],
      edges: [
        createMockErdEdge({
          source_table_id: 1,
          source_field_id: 12,
          target_table_id: 2,
          target_field_id: 21,
        }),
      ],
    };

    const { nodes } = toFlowGraph(response);
    const source = nodes.find((node) => node.id === "table-1")!;
    const target = nodes.find((node) => node.id === "table-2")!;

    expect(source).toMatchObject({
      width: NODE_WIDTH_PX,
      height: HEADER_HEIGHT_PX + 3 * ROW_HEIGHT_PX,
      style: {
        width: NODE_WIDTH_PX,
        height: HEADER_HEIGHT_PX + 3 * ROW_HEIGHT_PX,
      },
    });
    expect(source.data.handles).toEqual([
      {
        id: "field-12",
        type: "source",
        position: Position.Right,
        x: NODE_WIDTH_PX - 0.5,
        y: HEADER_HEIGHT_PX + ROW_HEIGHT_PX + (ROW_HEIGHT_PX - 1) / 2,
        width: 1,
        height: 1,
      },
    ]);
    expect(target.data.handles).toEqual([
      {
        id: "field-21",
        type: "target",
        position: Position.Left,
        x: -0.5,
        y: HEADER_HEIGHT_PX + (ROW_HEIGHT_PX - 1) / 2,
        width: 1,
        height: 1,
      },
    ]);
  });

  it("deduplicates a target handle shared by multiple incoming edges", () => {
    const targetField = createMockErdField({
      id: 21,
      semantic_type: "type/PK",
    });
    const response: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [createMockErdField({ id: 11, semantic_type: "type/FK" })],
        }),
        createMockErdNode({ table_id: 2, fields: [targetField] }),
        createMockErdNode({
          table_id: 3,
          fields: [createMockErdField({ id: 31, semantic_type: "type/FK" })],
        }),
      ],
      edges: [
        createMockErdEdge({
          source_table_id: 1,
          source_field_id: 11,
          target_table_id: 2,
          target_field_id: 21,
        }),
        createMockErdEdge({
          source_table_id: 3,
          source_field_id: 31,
          target_table_id: 2,
          target_field_id: 21,
        }),
      ],
    };

    const target = toFlowGraph(response).nodes.find(
      (node) => node.id === "table-2",
    )!;

    expect(
      target.data.handles.filter((handle) => handle.id === "field-21"),
    ).toEqual([
      expect.objectContaining({ type: "target", position: Position.Left }),
    ]);
  });

  it("declares a distinct right-side target handle for self references", () => {
    const response: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [
            createMockErdField({ id: 11, semantic_type: "type/FK" }),
            createMockErdField({ id: 12, semantic_type: "type/PK" }),
            createMockErdField({ id: 13, semantic_type: null }),
          ],
        }),
      ],
      edges: [
        createMockErdEdge({
          source_table_id: 1,
          source_field_id: 11,
          target_table_id: 1,
          target_field_id: 12,
        }),
      ],
    };

    const [node] = toFlowGraph(response).nodes;

    expect(node.data.handles).toEqual([
      expect.objectContaining({
        id: "field-12-right",
        type: "target",
        position: Position.Right,
        x: NODE_WIDTH_PX - 0.5,
      }),
      expect.objectContaining({
        id: "field-11",
        type: "source",
        position: Position.Right,
        x: NODE_WIDTH_PX - 0.5,
      }),
    ]);
    expect(node.data.handles.some((handle) => handle.id === "field-13")).toBe(
      false,
    );
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
  it("anchors each field by its edge roles, with self-reference targets on the right", () => {
    const response: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [createMockErdField({ id: 10 })],
        }),
        createMockErdNode({
          table_id: 2,
          fields: [
            createMockErdField({ id: 20 }),
            createMockErdField({ id: 21 }),
            createMockErdField({ id: 22 }),
          ],
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

    const anchors = (node: SchemaViewerFlowNode) =>
      node.data.handles
        .map((handle) => `${handle.type}:${handle.id}:${handle.position}`)
        .sort();

    expect(anchors(t1)).toEqual(["source:field-10:right"]);
    expect(anchors(t2)).toEqual([
      "source:field-21:right",
      "target:field-20:left",
      "target:field-22-right:right",
    ]);
  });
});

describe("toFlowGraph — caching", () => {
  // The cache is keyed on the response object. useGraphSync takes the graph as
  // an effect dependency, so returning the identical graph for a response the
  // viewer already holds is what stops the layout re-running and the viewport
  // resetting. RTK Query keeps one reference per cache entry, so that holds
  // across renders and remounts of the viewer.
  it("returns the same reference for the same response object", () => {
    const response: ErdResponse = {
      nodes: [
        createMockErdNode({
          table_id: 1,
          fields: [createMockErdField({ id: 10 })],
        }),
      ],
      edges: [createMockErdEdge({ source_field_id: 10, target_field_id: 20 })],
    };

    expect(toFlowGraph(response)).toBe(toFlowGraph(response));
  });

  it("returns a separate reference for a deep-equal but separate response", () => {
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

    expect(toFlowGraph(responseA)).not.toBe(toFlowGraph(responseB));
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
