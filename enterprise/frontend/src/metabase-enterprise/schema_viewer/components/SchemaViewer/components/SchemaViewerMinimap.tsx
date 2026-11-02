import { Panel, type XYPosition, useStoreApi } from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  FixedSizeIcon,
  Tooltip,
  useColorScheme,
} from "metabase/ui";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import {
  type MinimapTransform,
  drawMinimapNodes,
  getConnectionShading,
  getMinimapTransform,
  getViewportIndicator,
  minimapToWorld,
} from "../utils/minimap";
import { getGraphBounds } from "../utils/viewport-window";

import S from "./SchemaViewerMinimap.module.css";

// Matches the `--minimap-height` layout variable (10rem).
const MINIMAP_SIZE = { width: 200, height: 160 };
// Keeps the viewport visible when it projects to a few pixels on a large graph.
const MIN_INDICATOR_SIZE_PX = 8;

type SchemaViewerMinimapProps = {
  /** The full logical graph; React Flow may render only a subset. */
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
  onPanStart: () => void;
  onPanTo: (point: XYPosition) => void;
  onPanEnd: () => void;
};

/** Memoized: its props stay stable while a table is dragged. */
export const SchemaViewerMinimap = memo(function SchemaViewerMinimap(
  props: SchemaViewerMinimapProps,
) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return (
      <Panel className={S.showMinimapControl} position="bottom-right">
        <Tooltip label={t`Show minimap`}>
          <ActionIcon
            className={S.toggleButton}
            aria-label={t`Show minimap`}
            onClick={() => setIsVisible(true)}
          >
            <FixedSizeIcon name="map" size={16} />
          </ActionIcon>
        </Tooltip>
      </Panel>
    );
  }

  return (
    <>
      <FullGraphMinimap {...props} />
      <div className={S.hideMinimapControl}>
        <Tooltip label={t`Hide minimap`}>
          <ActionIcon
            className={S.toggleButton}
            aria-label={t`Hide minimap`}
            onClick={() => setIsVisible(false)}
          >
            <FixedSizeIcon name="close" size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </>
  );
});

/**
 * Draws the full logical graph to a canvas once per graph change. The viewport
 * rectangle is moved imperatively from the React Flow store, so panning does
 * not re-render React or redraw nodes.
 */
function FullGraphMinimap({
  nodes,
  edges,
  onPanStart,
  onPanTo,
  onPanEnd,
}: SchemaViewerMinimapProps) {
  const store = useStoreApi();
  // `colorScheme` is the user's setting and can be "auto".
  const { resolvedColorScheme } = useColorScheme();
  const isDark = resolvedColorScheme === "dark";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<MinimapTransform | null>(null);
  const isPanningRef = useRef(false);
  const pixelRatio = window.devicePixelRatio || 1;

  const shading = useMemo(
    () => getConnectionShading(edges, isDark),
    [edges, isDark],
  );

  const updateIndicator = useCallback(() => {
    const indicator = indicatorRef.current;
    const transform = transformRef.current;
    if (indicator == null) {
      return;
    }
    const { transform: viewport, width, height } = store.getState();
    if (transform == null || width === 0 || height === 0) {
      indicator.style.visibility = "hidden";
      return;
    }
    const [x, y, zoom] = viewport;
    const rect = getViewportIndicator(
      transform,
      { x, y, zoom },
      { width, height },
      MIN_INDICATOR_SIZE_PX,
    );
    indicator.style.visibility = "visible";
    indicator.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    indicator.style.width = `${rect.width}px`;
    indicator.style.height = `${rect.height}px`;
  }, [store]);

  useEffect(() => {
    const bounds = getGraphBounds(nodes);
    transformRef.current =
      bounds == null ? null : getMinimapTransform(bounds, MINIMAP_SIZE);
    const context = canvasRef.current?.getContext("2d");
    if (context != null) {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (transformRef.current == null) {
        context.clearRect(0, 0, MINIMAP_SIZE.width, MINIMAP_SIZE.height);
      } else {
        drawMinimapNodes(
          context,
          shading.orderForDrawing(nodes),
          transformRef.current,
          MINIMAP_SIZE,
          shading.getColor,
        );
      }
    }
    updateIndicator();
  }, [nodes, shading, pixelRatio, updateIndicator]);

  useEffect(() => store.subscribe(updateIndicator), [store, updateIndicator]);

  const panToPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const transform = transformRef.current;
    if (transform == null) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    onPanTo(
      minimapToWorld(transform, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }),
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    isPanningRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onPanStart();
    panToPointer(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      panToPointer(event);
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) {
      return;
    }
    isPanningRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onPanEnd();
  };

  return (
    <Panel
      className={S.minimap}
      position="bottom-right"
      data-testid="schema-viewer-minimap"
      style={{
        width: MINIMAP_SIZE.width,
        height: MINIMAP_SIZE.height,
        backgroundColor: isDark
          ? "var(--mb-color-background_page-secondary)"
          : "var(--mb-color-background_surface-primary)",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <canvas
        ref={canvasRef}
        className={S.canvas}
        data-testid="schema-viewer-minimap-canvas"
        width={MINIMAP_SIZE.width * pixelRatio}
        height={MINIMAP_SIZE.height * pixelRatio}
        aria-hidden
      />
      <div ref={indicatorRef} className={S.viewportIndicator} />
    </Panel>
  );
}
