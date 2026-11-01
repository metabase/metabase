import { act, renderHook } from "@testing-library/react";
import { useState } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

import { useEdgeHandlers } from "./useEdgeHandlers";

function makeEdge(id: string, selected = false): SchemaViewerFlowEdge {
  return {
    id,
    source: `source-${id}`,
    target: `target-${id}`,
    type: "schemaViewerEdge",
    selected,
    data: { relationship: "many-to-one" },
  };
}

function selectedIds(edges: SchemaViewerFlowEdge[]) {
  return edges.filter((edge) => edge.selected).map((edge) => edge.id);
}

function setup(initialEdges: SchemaViewerFlowEdge[]) {
  const zoomToNode = jest.fn();
  const { result } = renderHook(() => {
    const [edges, setEdges] = useState(initialEdges);
    const [, setNodes] = useState<SchemaViewerFlowNode[]>([]);
    const handlers = useEdgeHandlers({ zoomToNode, setNodes, setEdges });
    return { edges, ...handlers };
  });
  return { result, zoomToNode };
}

describe("useEdgeHandlers", () => {
  it("selects a clicked edge without moving the camera", () => {
    const { result, zoomToNode } = setup([makeEdge("a"), makeEdge("b", true)]);

    act(() => result.current.clickEdge(result.current.edges[0]));

    expect(selectedIds(result.current.edges)).toEqual(["a"]);
    expect(zoomToNode).not.toHaveBeenCalled();
  });

  it("alternates the camera between endpoints when a selected edge is clicked again", () => {
    const { result, zoomToNode } = setup([makeEdge("a", true)]);

    act(() => result.current.clickEdge(result.current.edges[0]));
    act(() => result.current.clickEdge(result.current.edges[0]));

    expect(zoomToNode.mock.calls).toEqual([["source-a"], ["target-a"]]);
    expect(selectedIds(result.current.edges)).toEqual(["a"]);
  });

  it("selects exactly the requested logical edges, including unrendered ones", () => {
    const { result } = renderHook(() => {
      const [edges, setEdges] = useState([
        makeEdge("offscreen", true),
        makeEdge("a"),
        makeEdge("b"),
      ]);
      const [, setNodes] = useState<SchemaViewerFlowNode[]>([]);
      const handlers = useEdgeHandlers({
        zoomToNode: jest.fn(),
        setNodes,
        setEdges,
      });
      return { edges, ...handlers };
    });

    act(() => result.current.selectEdges(new Set(["b"])));

    expect(selectedIds(result.current.edges)).toEqual(["b"]);
  });
});
