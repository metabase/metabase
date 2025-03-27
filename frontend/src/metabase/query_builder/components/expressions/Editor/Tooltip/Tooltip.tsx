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
import { enclosingFunction } from "metabase-lib/v1/expressions";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { HelpText } from "../HelpText";
import { Listbox, useCompletions } from "../Listbox";

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
      (hasMovedCursor) => hasMovedCursor || state.selection.main.head !== 0,
    );
  }, [state.selection.main.head]);

  const { options: completions } = useCompletions(state);

  const [isHelpTextOpen, setIsHelpTextOpen] = useState(true);
  const [preferHelpText, setPreferHelpText] = useState(false);

  const handleToggleHelpText = useCallback(() => {
    if (completions.length > 0) {
      setIsHelpTextOpen(!preferHelpText);
      setPreferHelpText(!preferHelpText);
      return;
    }
    setIsHelpTextOpen((open) => !open);
  }, [completions, preferHelpText]);

  useEffect(() => {
    if (completions.length > 0) {
      setPreferHelpText(false);
    }
  }, [completions.length, enclosingFn]);

  const shouldShowHelpText =
    completions.length === 0 ? isHelpTextOpen : preferHelpText;
  const shouldShowCompletions =
    completions.length === 0 ? false : !preferHelpText;

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
            open={shouldShowHelpText}
            onToggle={handleToggleHelpText}
          />
          {shouldShowCompletions && (
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
