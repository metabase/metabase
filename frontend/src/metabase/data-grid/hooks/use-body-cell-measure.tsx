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
        data-element-id="data-grid-measure-root"
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
        contentCell.innerHTML = getContentCellHtmlString(content);
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

function getContentCellHtmlString(content: React.ReactNode): string {
  // This renders a lightweight HTML on the SDK for DOM measurement.
  // `renderToString` from react-dom/server will crash Embedding SDK (metabase#58393)
  // Therefore, `process.env` is needed to tree-shake react-dom/server out of the SDK.
  // `reactNodeToHtmlString` will throw "cannot flush when React is already rendering" error (metabase#61164),
  if (process.env.IS_EMBEDDING_SDK) {
    if (isContentCell(content)) {
      const tag = content.type;
      const { href, className, children } = content.props;

      let attributes = `class="${className}"`;

      if (href) {
        attributes += ` href="${href}"`;
      }

      return `<${tag} ${attributes}>${children}</${tag}>`;
    }

    return "";
  }

  return renderToString(content);
}

const isContentCell = (
  content: React.ReactNode,
): content is React.ReactElement<
  { href?: string; className: string; children: string },
  string
> =>
  Boolean(
    content &&
      typeof content === "object" &&
      "type" in content &&
      typeof content.props.children === "string" &&
      typeof content.props.className === "string",
  );
