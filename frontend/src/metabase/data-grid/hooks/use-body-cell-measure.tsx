import type React from "react";
import { useCallback, useMemo, useRef } from "react";
import { renderToString } from "react-dom/server";

import { BodyCell } from "metabase/data-grid/components/BodyCell/BodyCell";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";

import { DEFAULT_FONT_SIZE } from "../constants";
import type { DataGridTheme } from "../types";

export type CellMeasurer = (
  content: React.ReactNode,
  width?: number,
) => CellSize;

export interface CellSize {
  width: number;
  height: number;
}

export const useCellMeasure = (
  cell: React.ReactNode,
  contentNodeSelector: string,
) => {
  const rootRef = useRef<HTMLDivElement>(null);

  const measureRoot = useMemo(() => {
    return (
      <div
        ref={rootRef}
        style={{
          position: "absolute",
          top: "-9999px",
          left: "-9999px",
          visibility: "hidden",
          pointerEvents: "none",
          zIndex: -999,
          fontSize: DEFAULT_FONT_SIZE,
          overflow: "visible",
        }}
      >
        {cell}
      </div>
    );
  }, [cell]);

  const measureDimensions: CellMeasurer = useCallback(
    (content: React.ReactNode, containerWidth?: number) => {
      const rootEl = rootRef.current;
      const contentCell = rootEl?.querySelector(contentNodeSelector);
      if (!rootEl || !contentCell) {
        throw new Error(
          `Trying to measure content "${content}" before measure root mounted`,
        );
      }

      rootEl.style.width =
        containerWidth != null ? `${containerWidth}px` : "auto";

      if (typeof content === "string") {
        contentCell.textContent = content;
      } else {
        contentCell.innerHTML = renderToString(content);
      }
      const boundingRect = rootEl.getBoundingClientRect();
      return {
        width: boundingRect.width,
        height: boundingRect.height,
      };
    },
    [contentNodeSelector],
  );

  return {
    measureRoot,
    measureDimensions,
  };
};

export const useBodyCellMeasure = (theme?: DataGridTheme) => {
  const bodyCellToMeasure = useMemo(
    () => (
      <BodyCell
        rowIndex={0}
        columnId="measure"
        wrap={true}
        value=""
        contentTestId=""
        style={{ fontSize: theme?.fontSize, overflow: "visible" }}
      />
    ),
    [theme?.fontSize],
  );
  const {
    measureDimensions: measureBodyCellDimensions,
    measureRoot: measureBodyCellRoot,
  } = useCellMeasure(bodyCellToMeasure, "[data-grid-cell-content]");

  const measureRoot = useMemo(
    () => (
      <EmotionCacheProvider>
        <ThemeProvider>{measureBodyCellRoot}</ThemeProvider>
      </EmotionCacheProvider>
    ),
    [measureBodyCellRoot],
  );

  return {
    measureBodyCellDimensions,
    measureRoot,
  };
};
