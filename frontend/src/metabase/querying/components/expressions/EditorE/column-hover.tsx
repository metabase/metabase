import { completionStatus } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { type ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLatest } from "react-use";

import { QueryColumnInfo } from "metabase/common/components/MetadataInfo/QueryColumnInfo";
import { formatIdentifier, tokenAtPos } from "metabase/querying/expressions";
import { FIELD } from "metabase/querying/expressions/pratt";
import * as Lib from "metabase-lib";

import S from "./EditorE.module.css";

const HOVER_DELAY_MS = 300;

type HoveredColumn = {
  container: HTMLElement;
  column: Lib.ColumnMetadata;
};

/**
 * Hovering a column in the code shows its info card, like the info icon of
 * the column list: its description and semantic type. Not while the list is
 * open, which already shows columns.
 */
export function useColumnHover({
  query,
  stageIndex,
  availableColumns,
}: {
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
}): [Extension, ReactNode] {
  const [hovered, setHovered] = useState<HoveredColumn | null>(null);
  // Read when hovering, so that the extension stays the same: a new one
  // would reconfigure the editor.
  const latest = useLatest({ query, stageIndex, availableColumns });

  const extension = useMemo(
    () =>
      hoverTooltip(
        (view, pos) => {
          if (completionStatus(view.state) != null) {
            return null;
          }
          const token = tokenAtPos(view.state.doc.toString(), pos);
          if (token?.type !== FIELD) {
            return null;
          }
          const { query, stageIndex, availableColumns } = latest.current;
          const column = findColumn(
            query,
            stageIndex,
            availableColumns,
            token.text,
          );
          if (column == null) {
            return null;
          }
          return {
            pos: token.start,
            end: token.end,
            above: false,
            create: () => {
              const container = document.createElement("div");
              container.className = S.columnHover;
              setHovered({ container, column });
              return {
                dom: container,
                destroy: () =>
                  setHovered((current) =>
                    current?.container === container ? null : current,
                  ),
              };
            },
          };
        },
        { hoverTime: HOVER_DELAY_MS },
      ),
    [latest],
  );

  const card =
    hovered != null
      ? createPortal(
          <QueryColumnInfo
            query={query}
            stageIndex={stageIndex}
            column={hovered.column}
          />,
          hovered.container,
        )
      : null;

  return [extension, card];
}

/** The column that a reference like `[Product → Title]` stands for. */
function findColumn(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  reference: string,
) {
  const wanted = reference.toLowerCase();
  return columns.find(
    (column) =>
      formatIdentifier(
        Lib.displayInfo(query, stageIndex, column).longDisplayName,
      ).toLowerCase() === wanted,
  );
}
