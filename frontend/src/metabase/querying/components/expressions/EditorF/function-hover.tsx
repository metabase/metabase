import { completionStatus } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { type ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLatest } from "react-use";

import { getMBQLName, tokenAtPos } from "metabase/querying/expressions";
import { CALL } from "metabase/querying/expressions/pratt";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { HelpText } from "./HelpText";

// Long enough that the card doesn't show while the pointer passes over the
// code, as in VS Code.
const HOVER_DELAY_MS = 1150;

type HoveredFunction = {
  container: HTMLElement;
  name: string;
};

/**
 * Hovering a function name in the code shows its reference after a delay:
 * the help popover of the old editor. Not while the suggestion list is open.
 */
export function useFunctionHover({
  database,
  reportTimezone,
  expressionMode,
}: {
  database: Pick<Database, "engine" | "features"> | undefined;
  reportTimezone?: string;
  expressionMode: Lib.ExpressionMode;
}): [Extension, ReactNode] {
  const [hovered, setHovered] = useState<HoveredFunction | null>(null);
  // Read when hovering, so that the extension stays the same: a new one
  // would reconfigure the editor.
  const latest = useLatest({ database, expressionMode });

  const extension = useMemo(
    () =>
      hoverTooltip(
        (view, pos) => {
          if (completionStatus(view.state) != null) {
            return null;
          }
          const source = view.state.doc.toString();
          const token = tokenAtPos(source, pos);
          // The lexer marks a name followed by "(" as a call.
          if (token?.type !== CALL) {
            return null;
          }
          // Typed names like `startsWith` differ from the clause names, like
          // `starts-with`.
          const name = getMBQLName(token.text);
          if (name == null || latest.current.database == null) {
            return null;
          }
          return {
            pos: token.start,
            end: token.end,
            above: false,
            create: () => {
              const container = document.createElement("div");
              setHovered({ container, name });
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
        { hoverTime: HOVER_DELAY_MS, hideOnChange: true },
      ),
    [latest],
  );

  const card =
    hovered != null
      ? createPortal(
          <HelpText
            name={hovered.name}
            database={database}
            reportTimezone={reportTimezone}
            expressionMode={expressionMode}
          />,
          hovered.container,
        )
      : null;

  return [extension, card];
}
