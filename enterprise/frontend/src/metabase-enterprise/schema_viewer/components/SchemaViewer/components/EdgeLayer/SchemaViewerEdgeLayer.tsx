import cx from "classnames";
import { memo, useMemo } from "react";

import type { EdgeGeometry } from "../../utils/edge-geometry";

import S from "./SchemaViewerEdgeLayer.module.css";

type SchemaViewerEdgeLayerProps = {
  geometries: readonly EdgeGeometry[];
  selectedEdgeIds: ReadonlySet<string>;
};

/**
 * Draws edges as a few batched SVG paths in graph coordinates. Rendered inside
 * React Flow's viewport, it pans and zooms with the canvas transform, so camera
 * movement does no per-edge work. Clicks are hit-tested by the caller.
 */
export const SchemaViewerEdgeLayer = memo(function SchemaViewerEdgeLayer({
  geometries,
  selectedEdgeIds,
}: SchemaViewerEdgeLayerProps) {
  const { edgePath, symbolPath, selected } = useMemo(() => {
    const edgePaths: string[] = [];
    const symbolPaths: string[] = [];
    const selected: EdgeGeometry[] = [];
    for (const geometry of geometries) {
      if (selectedEdgeIds.has(geometry.id)) {
        selected.push(geometry);
      } else {
        edgePaths.push(geometry.path);
        symbolPaths.push(geometry.symbolPath);
      }
    }
    return {
      edgePath: edgePaths.join(""),
      symbolPath: symbolPaths.join(""),
      selected,
    };
  }, [geometries, selectedEdgeIds]);

  return (
    <svg
      className={S.edgeLayer}
      data-testid="schema-viewer-edges"
      data-edge-count={geometries.length}
      aria-hidden
    >
      <path className={S.edge} d={edgePath} />
      <path className={S.symbol} d={symbolPath} />
      {selected.map((geometry) => (
        <g
          key={geometry.id}
          data-testid="schema-viewer-selected-edge"
          data-edge-id={geometry.id}
        >
          <path
            className={cx(S.edge, S.selected)}
            data-testid="schema-viewer-selected-edge-path"
            d={geometry.path}
          />
          <path className={cx(S.symbol, S.selected)} d={geometry.symbolPath} />
        </g>
      ))}
    </svg>
  );
});
