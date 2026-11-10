import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import cx from "classnames";
import { type RefObject, useEffect, useMemo, useState } from "react";

import { enclosingFunction } from "metabase/querying/expressions";
import { Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { HelpText } from "../HelpText";
import { Listbox, useCompletions } from "../Listbox";

import S from "./Tooltip.module.css";

export function Tooltip({
  query,
  stageIndex,
  database,
  reportTimezone,
  tooltipRef,
  expressionMode,

  state,
  view,
}: {
  query: Lib.Query;
  stageIndex: number;
  database: Pick<Database, "engine" | "features"> | undefined;
  reportTimezone?: string;
  expressionMode: Lib.ExpressionMode;

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

  const [hasMovedCursor, setHasMovedCursor] = useState(false);

  useEffect(() => {
    setHasMovedCursor(
      (hasMovedCursor) => hasMovedCursor || state.selection.main.head !== 0,
    );
  }, [state.selection.main.head]);

  const { options: completions } = useCompletions(state);

  const hasCompletions = completions.length > 0;

  return (
    <Popover
      opened={hasMovedCursor}
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
        className={S.dropdown}
        data-ignore-editor-clicks="true"
      >
        <div
          className={cx(S.tooltip, { [S.withCard]: !hasCompletions })}
          ref={tooltipRef}
        >
          <HelpText
            enclosingFunction={enclosingFn}
            database={database}
            reportTimezone={reportTimezone}
            variant={hasCompletions ? "structure" : "card"}
            expressionMode={expressionMode}
          />
          {hasCompletions && (
            <Listbox
              state={state}
              view={view}
              query={query}
              stageIndex={stageIndex}
            />
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
