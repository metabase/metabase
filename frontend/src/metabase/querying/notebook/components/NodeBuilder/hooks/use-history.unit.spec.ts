import { act, renderHook } from "@testing-library/react";

import { createBlankNode, createResultNode, graphKey } from "../graph";
import type { BuilderEdge, BuilderNode } from "../types";

import { useHistory } from "./use-history";

const ORIGIN = { x: 0, y: 0 };

function renderHistory(nodes: BuilderNode[], edges: BuilderEdge[] = []) {
  const setNodes = jest.fn();
  const setEdges = jest.fn();
  const view = renderHook(
    ({ nodes, edges }: { nodes: BuilderNode[]; edges: BuilderEdge[] }) =>
      useHistory({
        nodes,
        edges,
        structureKey: graphKey(nodes, edges),
        setNodes,
        setEdges,
        isEnabled: true,
      }),
    { initialProps: { nodes, edges } },
  );
  return { ...view, setNodes, setEdges };
}

describe("useHistory", () => {
  it("does not count the seed landing on the empty canvas as an edit", () => {
    const view = renderHistory([]);
    expect(view.result.current.canUndo).toBe(false);

    const seeded = [createResultNode(ORIGIN), createBlankNode("table", ORIGIN)];
    view.rerender({ nodes: seeded, edges: [] });
    expect(view.result.current.canUndo).toBe(false);

    const edited = [...seeded, createBlankNode("filter", ORIGIN)];
    view.rerender({ nodes: edited, edges: [] });
    expect(view.result.current.canUndo).toBe(true);

    act(() => view.result.current.undo("toolbar"));
    expect(view.setNodes).toHaveBeenCalledWith(seeded);
  });
});
