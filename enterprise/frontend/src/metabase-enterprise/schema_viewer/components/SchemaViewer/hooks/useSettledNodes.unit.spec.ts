import { renderHook } from "@testing-library/react";

import type { SchemaViewerFlowNode } from "../types";
import { makeFlowNode } from "../utils/test-utils";

import { useSettledNodes } from "./useSettledNodes";

type Props = { nodes: SchemaViewerFlowNode[]; isNodeDragging: boolean };

describe("useSettledNodes", () => {
  it("holds the pre-drag nodes during a drag and releases the latest after it", () => {
    const before = [makeFlowNode({ id: 1, position: { x: 0, y: 0 } })];
    const { result, rerender } = renderHook(
      ({ nodes, isNodeDragging }: Props) =>
        useSettledNodes(nodes, isNodeDragging),
      { initialProps: { nodes: before, isNodeDragging: false } },
    );
    expect(result.current).toBe(before);

    const midDrag = [makeFlowNode({ id: 1, position: { x: 50, y: 0 } })];
    rerender({ nodes: midDrag, isNodeDragging: true });
    expect(result.current).toBe(before);

    const dropped = [makeFlowNode({ id: 1, position: { x: 90, y: 0 } })];
    rerender({ nodes: dropped, isNodeDragging: true });
    expect(result.current).toBe(before);

    rerender({ nodes: dropped, isNodeDragging: false });
    expect(result.current).toBe(dropped);
  });
});
