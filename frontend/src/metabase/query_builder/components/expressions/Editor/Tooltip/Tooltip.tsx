import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { HelpText } from "../HelpText";
import { Listbox, useCompletions } from "../Listbox";
import { enclosingFunction } from "../utils";

import S from "./Tooltip.module.css";

export function Tooltip({
  query,
  stageIndex,
  metadata,
  reportTimezone,
  tooltipRef,

  state,
  view,
}: {
  query: Lib.Query;
  stageIndex: number;
  metadata: Metadata;
  reportTimezone?: string;

  // from tooltip extension
  tooltipRef: RefObject<HTMLDivElement>;
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
      hasMovedCursor => hasMovedCursor || state.selection.main.head !== 0,
    );
  }, [state.selection.main.head]);

  const { options: completions } = useCompletions(state);

  const [isHelpTextOpen, setIsHelpTextOpen] = useState(false);
  const handleToggleHelpText = useCallback(
    () => setIsHelpTextOpen(open => !open),
    [],
  );

  useEffect(() => {
    if (completions.length === 0) {
      setIsHelpTextOpen(true);
    }
    if (enclosingFn && completions.length > 0) {
      setIsHelpTextOpen(false);
    }
  }, [enclosingFn, completions.length]);

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
        <div className={S.tooltip} ref={tooltipRef}>
          <HelpText
            enclosingFunction={enclosingFn}
            query={query}
            metadata={metadata}
            reportTimezone={reportTimezone}
            open={isHelpTextOpen}
            onToggle={handleToggleHelpText}
          />
          {(!isHelpTextOpen || !enclosingFn) && (
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
