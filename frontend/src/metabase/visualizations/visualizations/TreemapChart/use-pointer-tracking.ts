import { useCallback, useMemo, useRef } from "react";

import type { ChartPointer } from "metabase/visualizations/echarts/graph/treemap/model/types";
import type { ZREventHandler } from "metabase/visualizations/types/echarts";

export function usePointerTracking(): {
  zrEventHandlers: ZREventHandler[];
  getPointer: () => ChartPointer | null;
} {
  const pointerRef = useRef<ChartPointer | null>(null);

  const zrEventHandlers = useMemo<ZREventHandler[]>(
    () => [
      {
        eventName: "mousemove",
        handler: (event: { offsetX: number; offsetY: number }) => {
          pointerRef.current = { x: event.offsetX, y: event.offsetY };
        },
      },
      {
        eventName: "globalout",
        handler: () => {
          pointerRef.current = null;
        },
      },
    ],
    [],
  );

  const getPointer = useCallback(() => pointerRef.current, []);

  return { zrEventHandlers, getPointer };
}
