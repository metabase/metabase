import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import cx from "classnames";
import { type RefObject, useMemo } from "react";

import {
  enclosingFunction,
  getClauseDefinition,
} from "metabase/querying/expressions";
import { Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { Listbox, useCompletions } from "../Listbox";

import S from "./Tooltip.module.css";

export function Tooltip({
  query,
  stageIndex,
  database,
  reportTimezone,
  tooltipRef,

  state,
  view,
}: {
  query: Lib.Query;
  stageIndex: number;
  database: Pick<Database, "engine" | "features"> | undefined;
  reportTimezone?: string;

  // from tooltip extension
  tooltipRef: RefObject<HTMLDivElement | null>;
  state: EditorState;
  view: EditorView;
}) {
  const doc = state.doc.toString();

  const enclosingFn = useMemo(
    () => enclosingFunction(doc, state.selection.main.head),
    [doc, state.selection.main.head],
  );

  const { options: completions } = useCompletions(state);
  const hasCompletions = completions.length > 0;

  return (
    <Popover
      // Only the suggestions show here, as soon as there are any, also in an
      // editor that just opened.
      opened={hasCompletions}
      position="bottom-start"
      returnFocus
      closeOnEscape
      middlewares={{ shift: false, flip: false, size: true }}
      floatingStrategy="fixed"
      positionDependencies={[doc, enclosingFn, state.selection.main.head]}
    >
      <Popover.Target>
        <div className={S.target} />
      </Popover.Target>
      <Popover.Dropdown
        data-testid="custom-expression-editor-suggestions"
        className={cx(S.dropdown, {
          [S.completions]: hasCompletions,
        })}
        data-ignore-editor-clicks="true"
      >
        <div className={S.tooltip} ref={tooltipRef}>
          {hasCompletions && (
            <Listbox
              state={state}
              view={view}
              query={query}
              stageIndex={stageIndex}
              database={database}
              reportTimezone={reportTimezone}
              heading={getArgDescription(enclosingFn)}
            />
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

/** The description of the argument at the cursor, as plain text. */
function getArgDescription(fn: ReturnType<typeof enclosingFunction>) {
  if (fn?.arg == null) {
    return undefined;
  }
  const args = getClauseDefinition(fn.name)?.args ?? [];
  const arg = args[fn.arg.index];
  return arg?.name !== "…" ? arg?.description?.replace(/`/g, "") : undefined;
}
