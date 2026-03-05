import type { ErdEdge, ErdField, ErdNode, ErdResponse } from "metabase-types/api";

import {
  COMPACT_NODE_HEIGHT,
  HEADER_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
} from "./constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";
import { getNodeId, getNodesWithPositions, toFlowGraph } from "./utils";

// Mock field helper for creating test fields
const createField = (
  id: number,
  name: string,
  semanticType: string | null = null,
  fkTargetFieldId: number | null = null,
): ErdField => ({
  id,
  name,
  semantic_type: semanticType,
  fk_target_field_id: fkTargetFieldId,
  base_type: "type/Text",
});

// Mock node helper
const createNode = (
  tableId: number,
  tableName: string,
  fields: ErdField[],
): ErdNode => ({
  table_id: tableId,
  table_name: tableName,
  schema: "PUBLIC",
  fields,
  is_focal: false,
});

describe("SchemaViewer utils", () => {
  describe("getNodeId", () => {
    it("should generate correct node ID from table_id", () => {
      expect(getNodeId({ table_id: 1 })).toBe("table-1");
      expect(getNodeId({ table_id: 42 })).toBe("table-42");
    });
  });

  describe("sortFields", () => {
    it("should sort PK first", () => {
      const fields = [
        createField(1, "name"),
        createField(2, "id", "type/PK"),
        createField(3, "email"),
      ];

      const result = toFlowGraph({
        nodes: [createNode(1, "users", fields)],
        edges: [],
      });

      const sortedFields = result.nodes[0].data.fields;
      expect(sortedFields[0].id).toBe(2);
      expect(sortedFields[0].semantic_type).toBe("type/PK");
    });

    it("should sort FK second after PK", () => {
      const fields = [
        createField(1, "name"),
        createField(2, "user_id", "type/FK", 10),
        createField(3, "id", "type/PK"),
        createField(4, "product_id", "type/FK", 20),
      ];

      const result = toFlowGraph({
        nodes: [createNode(1, "orders", fields)],
        edges: [],
      });

      const sortedFields = result.nodes[0].data.fields;
      expect(sortedFields[0].semantic_type).toBe("type/PK");
      expect(sortedFields[1].semantic_type).toBe("type/FK");
      expect(sortedFields[2].semantic_type).toBe("type/FK");
      expect(sortedFields[3].semantic_type).toBeNull();
    });

    it("should maintain original order within same category", () => {
      const fields = [
        createField(1, "name"),
        createField(2, "email"),
        createField(3, "phone"),
      ];

      const result = toFlowGraph({
        nodes: [createNode(1, "users", fields)],
        edges: [],
      });

      const sortedFields = result.nodes[0].data.fields;
      expect(sortedFields[0].name).toBe("name");
      expect(sortedFields[1].name).toBe("email");
      expect(sortedFields[2].name).toBe("phone");
    });

    it("should handle empty field array", () => {
      const result = toFlowGraph({
        nodes: [createNode(1, "empty", [])],
        edges: [],
      });

      expect(result.nodes[0].data.fields).toEqual([]);
    });
  });

  describe("getNodeHeight", () => {
    it("should calculate height based on field count", () => {
      const fields = Array.from({ length: 5 }, (_, i) =>
        createField(i, `field${i}`),
      );
      const node = createNode(1, "small_table", fields);
      const flowNode = toFlowGraph({ nodes: [node], edges: [] }).nodes[0];

      const expectedHeight = HEADER_HEIGHT + 5 * ROW_HEIGHT;
      expect(flowNode.style?.height).toBe(expectedHeight);
    });

    it("should calculate height for larger tables without collapse", () => {
      const fields = Array.from({ length: 25 }, (_, i) =>
        createField(i, `field${i}`),
      );
      const node = createNode(1, "large_table", fields);
      const flowNode = toFlowGraph({ nodes: [node], edges: [] }).nodes[0];

      // All fields are shown without collapsing
      const expectedHeight = HEADER_HEIGHT + 25 * ROW_HEIGHT;
      expect(flowNode.style?.height).toBe(expectedHeight);
    });

    it("should handle empty field list", () => {
      const node = createNode(1, "empty_table", []);
      const flowNode = toFlowGraph({ nodes: [node], edges: [] }).nodes[0];

      const expectedHeight = HEADER_HEIGHT;
      expect(flowNode.style?.height).toBe(expectedHeight);
    });
  });

  describe("toFlowNode", () => {
    it("should transform ErdNode to SchemaViewerFlowNode with correct structure", () => {
      const fields = [
        createField(1, "id", "type/PK"),
        createField(2, "name"),
      ];
      const node = createNode(42, "users", fields);
      const flowNode = toFlowGraph({ nodes: [node], edges: [] }).nodes[0];

      expect(flowNode.id).toBe("table-42");
      expect(flowNode.type).toBe("schemaViewerTable");
      expect(flowNode.position).toEqual({ x: 0, y: 0 });
      expect(flowNode.data.table_id).toBe(42);
      expect(flowNode.data.table_name).toBe("users");
      expect(flowNode.style?.width).toBe(NODE_WIDTH);
    });

    it("should include connectedFieldIds in node data", () => {
      const fields = [
        createField(1, "id", "type/PK"),
        createField(2, "user_id", "type/FK", 10),
      ];
      const edge: ErdEdge = {
        source_table_id: 1,
        source_field_id: 2,
        target_table_id: 2,
        target_field_id: 10,
        relationship: "one-to-one",
      };

      const result = toFlowGraph({
        nodes: [createNode(1, "orders", fields)],
        edges: [edge],
      });

      expect(result.nodes[0].data.connectedFieldIds).toContain(2);
      expect(result.nodes[0].data.connectedFieldIds.size).toBe(1);
    });

    it("should have empty connectedFieldIds for isolated nodes", () => {
      const fields = [createField(1, "id", "type/PK")];
      const result = toFlowGraph({
        nodes: [createNode(1, "isolated", fields)],
        edges: [],
      });

      expect(result.nodes[0].data.connectedFieldIds.size).toBe(0);
    });
  });

  describe("toFlowEdge", () => {
    it("should transform ErdEdge to SchemaViewerFlowEdge", () => {
      const edge: ErdEdge = {
        source_table_id: 1,
        source_field_id: 2,
        target_table_id: 3,
        target_field_id: 4,
        relationship: "many-to-one",
      };

      const result = toFlowGraph({
        nodes: [],
        edges: [edge],
      });

      const flowEdge = result.edges[0];
      expect(flowEdge.id).toBe("edge-2-4");
      expect(flowEdge.source).toBe("table-1");
      expect(flowEdge.target).toBe("table-3");
      expect(flowEdge.sourceHandle).toBe("field-2");
      expect(flowEdge.targetHandle).toBe("field-4");
      expect(flowEdge.type).toBe("schemaViewerEdge");
      expect(flowEdge.data.relationship).toBe("many-to-one");
    });

    it("should handle self-referencing edges with right target handle", () => {
      const edge: ErdEdge = {
        source_table_id: 1,
        source_field_id: 2,
        target_table_id: 1,
        target_field_id: 3,
        relationship: "one-to-one",
      };

      const result = toFlowGraph({
        nodes: [],
        edges: [edge],
      });

      const flowEdge = result.edges[0];
      expect(flowEdge.source).toBe("table-1");
      expect(flowEdge.target).toBe("table-1");
      expect(flowEdge.targetHandle).toBe("field-3-right");
    });

    it("should use left target handle for non-self-referencing edges", () => {
      const edge: ErdEdge = {
        source_table_id: 1,
        source_field_id: 2,
        target_table_id: 2,
        target_field_id: 3,
        relationship: "many-to-one",
      };

      const result = toFlowGraph({
        nodes: [],
        edges: [edge],
      });

      expect(result.edges[0].targetHandle).toBe("field-3");
    });
  });

  describe("toFlowGraph", () => {
    it("should calculate connectedFieldIds for all nodes", () => {
      const edges: ErdEdge[] = [
        {
          source_table_id: 1,
          source_field_id: 2,
          target_table_id: 2,
          target_field_id: 10,
          relationship: "many-to-one",
        },
        {
          source_table_id: 1,
          source_field_id: 3,
          target_table_id: 3,
          target_field_id: 20,
          relationship: "many-to-one",
        },
      ];

      const result = toFlowGraph({
        nodes: [
          createNode(1, "orders", [
            createField(1, "id", "type/PK"),
            createField(2, "user_id", "type/FK", 10),
            createField(3, "product_id", "type/FK", 20),
          ]),
          createNode(2, "users", [createField(10, "id", "type/PK")]),
          createNode(3, "products", [createField(20, "id", "type/PK")]),
        ],
        edges,
      });

      // Orders table should have fields 2 and 3 connected
      const ordersNode = result.nodes.find((n) => n.id === "table-1");
      expect(ordersNode?.data.connectedFieldIds).toContain(2);
      expect(ordersNode?.data.connectedFieldIds).toContain(3);

      // Users table should have field 10 connected
      const usersNode = result.nodes.find((n) => n.id === "table-2");
      expect(usersNode?.data.connectedFieldIds).toContain(10);

      // Products table should have field 20 connected
      const productsNode = result.nodes.find((n) => n.id === "table-3");
      expect(productsNode?.data.connectedFieldIds).toContain(20);
    });

    it("should handle multiple edges to same field", () => {
      const edges: ErdEdge[] = [
        {
          source_table_id: 1,
          source_field_id: 2,
          target_table_id: 2,
          target_field_id: 10,
          relationship: "many-to-one",
        },
        {
          source_table_id: 3,
          source_field_id: 5,
          target_table_id: 2,
          target_field_id: 10,
          relationship: "many-to-one",
        },
      ];

      const result = toFlowGraph({
        nodes: [
          createNode(1, "orders", [createField(2, "user_id", "type/FK", 10)]),
          createNode(2, "users", [createField(10, "id", "type/PK")]),
          createNode(3, "reviews", [createField(5, "user_id", "type/FK", 10)]),
        ],
        edges,
      });

      const usersNode = result.nodes.find((n) => n.id === "table-2");
      expect(usersNode?.data.connectedFieldIds.size).toBe(1);
      expect(usersNode?.data.connectedFieldIds).toContain(10);
    });

    it("should memoize results for identical input", () => {
      const data: ErdResponse = {
        nodes: [
          createNode(1, "users", [
            createField(1, "id", "type/PK"),
            createField(2, "name"),
          ]),
        ],
        edges: [],
      };

      const result1 = toFlowGraph(data);
      const result2 = toFlowGraph(data);

      // Should return the same reference (memoized)
      expect(result1).toBe(result2);
    });

    it("should not memoize when data changes", () => {
      const data1: ErdResponse = {
        nodes: [createNode(1, "users", [createField(1, "id", "type/PK")])],
        edges: [],
      };

      const data2: ErdResponse = {
        nodes: [
          createNode(1, "users", [
            createField(1, "id", "type/PK"),
            createField(2, "name"),
          ]),
        ],
        edges: [],
      };

      const result1 = toFlowGraph(data1);
      const result2 = toFlowGraph(data2);

      // Should return different references
      expect(result1).not.toBe(result2);
      expect(result1.nodes[0].data.fields.length).toBe(1);
      expect(result2.nodes[0].data.fields.length).toBe(2);
    });
  });

  describe("getLayoutNodeHeight", () => {
    it("should return COMPACT_NODE_HEIGHT in compact mode", () => {
      const node: SchemaViewerFlowNode = {
        id: "table-1",
        type: "schemaViewerTable",
        position: { x: 0, y: 0 },
        data: {
          table_id: 1,
          table_name: "users",
          schema: "PUBLIC",
          fields: Array.from({ length: 30 }, (_, i) =>
            createField(i, `field${i}`),
          ),
          is_focal: false,
          connectedFieldIds: new Set(),
        },
      };

      const positionedNodes = getNodesWithPositions([node], [], true);
      expect(positionedNodes[0].style?.height).toBe(COMPACT_NODE_HEIGHT);
    });

    it("should calculate full height in non-compact mode", () => {
      const fields = Array.from({ length: 10 }, (_, i) =>
        createField(i, `field${i}`),
      );
      const node: SchemaViewerFlowNode = {
        id: "table-1",
        type: "schemaViewerTable",
        position: { x: 0, y: 0 },
        data: {
          table_id: 1,
          table_name: "users",
          schema: "PUBLIC",
          fields,
          is_focal: false,
          connectedFieldIds: new Set(),
        },
      };

      const positionedNodes = getNodesWithPositions([node], [], false);
      const expectedHeight = HEADER_HEIGHT + 10 * ROW_HEIGHT;
      expect(positionedNodes[0].style?.height).toBe(expectedHeight);
    });

    it("should show all fields for large tables in non-compact mode", () => {
      const fields = Array.from({ length: 25 }, (_, i) =>
        createField(i, `field${i}`),
      );
      const node: SchemaViewerFlowNode = {
        id: "table-1",
        type: "schemaViewerTable",
        position: { x: 0, y: 0 },
        data: {
          table_id: 1,
          table_name: "large_table",
          schema: "PUBLIC",
          fields,
          is_focal: false,
          connectedFieldIds: new Set(),
        },
      };

      const positionedNodes = getNodesWithPositions([node], [], false);
      // All fields are shown without collapsing
      const expectedHeight = HEADER_HEIGHT + 25 * ROW_HEIGHT;
      expect(positionedNodes[0].style?.height).toBe(expectedHeight);
    });
  });

  describe("getNodesWithPositions", () => {
    it("should assign positions to nodes using dagre layout", () => {
      const nodes: SchemaViewerFlowNode[] = [
        {
          id: "table-1",
          type: "schemaViewerTable",
          position: { x: 0, y: 0 },
          data: {
            table_id: 1,
            table_name: "users",
            schema: "PUBLIC",
            fields: [],
            is_focal: false,
            connectedFieldIds: new Set(),
          },
        },
        {
          id: "table-2",
          type: "schemaViewerTable",
          position: { x: 0, y: 0 },
          data: {
            table_id: 2,
            table_name: "orders",
            schema: "PUBLIC",
            fields: [],
            is_focal: false,
            connectedFieldIds: new Set(),
          },
        },
      ];

      const edges = [{ source: "table-1", target: "table-2" }];
      const positionedNodes = getNodesWithPositions(nodes, edges, false);

      // All nodes should have non-zero positions (dagre layout)
      positionedNodes.forEach((node) => {
        expect(node.position.x).toBeDefined();
        expect(node.position.y).toBeDefined();
      });

      // Nodes should have unique positions
      const positions = positionedNodes.map((n) => `${n.position.x},${n.position.y}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(2);
    });

    it("should center positions (x - width/2, y - height/2)", () => {
      const node: SchemaViewerFlowNode = {
        id: "table-1",
        type: "schemaViewerTable",
        position: { x: 0, y: 0 },
        data: {
          table_id: 1,
          table_name: "users",
          schema: "PUBLIC",
          fields: [],
          is_focal: false,
          connectedFieldIds: new Set(),
        },
      };

      const positionedNodes = getNodesWithPositions([node], [], false);
      const positioned = positionedNodes[0];

      // Dagre returns center point, should be offset by width/2 and height/2
      expect(positioned.position.x).toBeLessThan(
        positioned.style?.width as number,
      );
      expect(positioned.position.y).toBeLessThan(
        positioned.style?.height as number,
      );
    });

    it("should sync width and height in style", () => {
      const node: SchemaViewerFlowNode = {
        id: "table-1",
        type: "schemaViewerTable",
        position: { x: 0, y: 0 },
        data: {
          table_id: 1,
          table_name: "users",
          schema: "PUBLIC",
          fields: [],
          is_focal: false,
          connectedFieldIds: new Set(),
        },
      };

      const positionedNodes = getNodesWithPositions([node], [], false);
      const positioned = positionedNodes[0];

      expect(positioned.style?.width).toBe(NODE_WIDTH);
      expect(positioned.style?.height).toBeDefined();
    });

    it("should handle multiple nodes with complex edge relationships", () => {
      const nodes: SchemaViewerFlowNode[] = [
        {
          id: "table-1",
          type: "schemaViewerTable",
          position: { x: 0, y: 0 },
          data: {
            table_id: 1,
            table_name: "users",
            schema: "PUBLIC",
            fields: [],
            is_focal: false,
            connectedFieldIds: new Set(),
          },
        },
        {
          id: "table-2",
          type: "schemaViewerTable",
          position: { x: 0, y: 0 },
          data: {
            table_id: 2,
            table_name: "orders",
            schema: "PUBLIC",
            fields: [],
            is_focal: false,
            connectedFieldIds: new Set(),
          },
        },
        {
          id: "table-3",
          type: "schemaViewerTable",
          position: { x: 0, y: 0 },
          data: {
            table_id: 3,
            table_name: "products",
            schema: "PUBLIC",
            fields: [],
            is_focal: false,
            connectedFieldIds: new Set(),
          },
        },
      ];

      const edges = [
        { source: "table-1", target: "table-2" },
        { source: "table-2", target: "table-3" },
      ];

      const positionedNodes = getNodesWithPositions(nodes, edges, false);

      // All 3 nodes should have unique positions
      expect(positionedNodes).toHaveLength(3);
      const positions = positionedNodes.map((n) => `${n.position.x},${n.position.y}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(3);
    });

    it("should use different heights in compact vs full mode", () => {
      const fields = Array.from({ length: 10 }, (_, i) =>
        createField(i, `field${i}`),
      );
      const node: SchemaViewerFlowNode = {
        id: "table-1",
        type: "schemaViewerTable",
        position: { x: 0, y: 0 },
        data: {
          table_id: 1,
          table_name: "users",
          schema: "PUBLIC",
          fields,
          is_focal: false,
          connectedFieldIds: new Set(),
        },
      };

      const compactNodes = getNodesWithPositions([node], [], true);
      const fullNodes = getNodesWithPositions([node], [], false);

      expect(compactNodes[0].style?.height).toBe(COMPACT_NODE_HEIGHT);
      expect(fullNodes[0].style?.height).toBe(
        HEADER_HEIGHT + 10 * ROW_HEIGHT,
      );
    });
  });
});
