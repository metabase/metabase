import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import cx from "classnames";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
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

const HEIGHT_THRESHOLD = 320;

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

  const maxHeight = usePopoverHeight(tooltipRef);
  const canShowBoth = maxHeight > HEIGHT_THRESHOLD;

  const [isHelpTextOpen, setIsHelpTextOpen] = useState(false);
  const handleToggleHelpText = useCallback(
    () => setIsHelpTextOpen(open => !open),
    [],
  );

  useEffect(() => {
    if (completions.length === 0) {
      setIsHelpTextOpen(true);
    }
    if (!canShowBoth && enclosingFn && completions.length > 0) {
      setIsHelpTextOpen(false);
    }
  }, [canShowBoth, enclosingFn, completions.length]);

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
          {(canShowBoth || !isHelpTextOpen || !enclosingFn) && (
            <Listbox
              state={state}
              view={view}
              query={query}
              stageIndex={stageIndex}
              className={cx(
                enclosingFn && S.hasHelpText,
                enclosingFn && isHelpTextOpen && S.isHelpTextOpen,
              )}
            />
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function usePopoverHeight(ref: RefObject<HTMLDivElement>) {
  const [maxHeight, setMaxHeight] = useState(0);
  // We want to explicitly read the max height everytime we render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const px = ref.current?.parentElement?.style.maxHeight ?? "0";
    const parsed = parseInt(px, 10);
    if (!Number.isNaN(parsed)) {
      setMaxHeight(parsed);
    }
  });
  return maxHeight;
}
