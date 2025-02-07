import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
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
import { enclosingFunction } from "../util";

import S from "./Tooltip.module.css";
import { getHelpTextHeight, getListboxHeight } from "./util";

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
  tooltipRef: React.RefObject<HTMLDivElement>;
  state: EditorState;
  view: EditorView;
}) {
  const doc = state.doc.toString();

  const enclosingFn = useMemo(
    () => enclosingFunction(doc, state.selection.main.head),
    [doc, state.selection.main.head],
  );

  const { options } = useCompletions(state);

  const maxHeight = usePopoverHeight(tooltipRef);
  const canShowBoth = maxHeight > HEIGHT_THRESHOLD;

  const [isHelpTextOpen, setIsHelpTextOpen] = useState(false);
  const isListboxOpen = canShowBoth || !isHelpTextOpen || !enclosingFn;

  const handleToggleHelpText = useCallback(
    () => setIsHelpTextOpen(open => !open),
    [],
  );

  const listboxHeight = getListboxHeight({
    maxHeight,
    isHelpTextOpen: isHelpTextOpen && Boolean(enclosingFn),
    hasHelpText: Boolean(enclosingFn),
    options,
  });
  const helpTextHeight = getHelpTextHeight({
    maxHeight,
    listboxHeight,
    isListboxOpen,
  });

  useEffect(() => {
    if (!canShowBoth && enclosingFn && options.length > 0) {
      setIsHelpTextOpen(false);
      return;
    }
    if (!canShowBoth && options.length === 0) {
      setIsHelpTextOpen(true);
      return;
    }
  }, [canShowBoth, enclosingFn, options.length]);

  return (
    <Popover
      opened
      position="bottom-start"
      returnFocus
      closeOnEscape
      middlewares={{ shift: false, flip: false }}
      positionDependencies={[doc, state.selection.main.head, options.length]}
    >
      <Popover.Target>
        <div />
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
            height={helpTextHeight}
          />
          {isListboxOpen && (
            <Listbox
              state={state}
              view={view}
              query={query}
              stageIndex={stageIndex}
              height={listboxHeight}
            />
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function usePopoverHeight(ref: React.RefObject<HTMLDivElement>) {
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
