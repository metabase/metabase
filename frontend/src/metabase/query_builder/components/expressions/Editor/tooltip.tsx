import {
  type Completion,
  acceptCompletion,
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
  setSelectedCompletion,
} from "@codemirror/autocomplete";
import {
  type EditorState,
  type Extension,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  type Tooltip as TooltipView,
  showTooltip,
} from "@codemirror/view";
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { Tooltip } from "./Tooltip/Tooltip";
import { tokenAtPos } from "./suggestions";
import { enclosingFunction } from "./util";

// TODO: Toggle help description open/close expand
// TODO: Segments/metrics always shown?
// TODO: highlight currently shown documentation (enclosingFunction)
// TODO: remove bold from non-existing/unsupported functions
// TODO: allow using keys after clicking the popover
// TODO: fix fonts

type TooltipOptions = {
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
};

type State = {
  completions: readonly Completion[];
  selectedCompletion: number | null;
  enclosingFunction: {
    name: string;
    from: number;
    to: number;
  } | null;
};

/**
 * Set up a custom tooltip that renders content with React but uses the CodeMirror
 * suggestions.
 *
 * Note: this is a bit hacky, but there is currently no other way to render custom
 * tooltips with suggestions in CodeMirror.
 */
export function useTooltip({
  query,
  metadata,
  reportTimezone,
}: TooltipOptions): [Extension[], React.ReactNode] {
  const [state, setState] = useState<State>({
    completions: [],
    selectedCompletion: null,
    enclosingFunction: null,
  });

  const view = useRef<EditorView | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const element = useMemo(() => document.createElement("div"), []);

  const [hasFocus, setHasFocus] = useState(false);

  const handleFocus = useCallback(() => setHasFocus(true), []);
  const handleBlur = useCallback(() => setHasFocus(false), []);

  const extensions = useMemo(
    () => [
      tooltip(element),
      EditorView.domEventHandlers({
        focus: handleFocus,
        blur(evt) {
          evt.preventDefault();
          evt.stopPropagation();

          const el = evt.relatedTarget as HTMLElement | null;
          if (tooltipRef.current === el || tooltipRef.current?.contains(el)) {
            return;
          }

          handleBlur();
        },
      }),
      EditorView.updateListener.of(update => {
        view.current = update.view;
        setState(state => {
          const enclosingFn = enclosingFunction(
            update.state.doc.toString(),
            update.state.selection.main.head,
          );
          const status = completionStatus(update.state);

          if (status === "pending") {
            // use the previous completions, if they exist
            return {
              ...state,
              completions: state.completions,
              selectedCompletion: state.selectedCompletion,
              enclosingFunction: enclosingFn,
            };
          }
          return {
            ...state,
            completions: currentCompletions(update.state),
            selectedCompletion: selectedCompletionIndex(update.state),
            enclosingFunction: enclosingFn,
          };
        });
      }),
    ],
    [element, handleBlur, handleFocus],
  );

  const handleCompletionClick = useCallback((index: number) => {
    if (!view.current) {
      return;
    }

    view.current.dispatch({
      effects: [setSelectedCompletion(index)],
    });
    acceptCompletion(view.current);
  }, []);

  return [
    extensions,
    createPortal(
      <Tooltip
        ref={tooltipRef}
        {...state}
        hasFocus={hasFocus}
        query={query}
        metadata={metadata}
        reportTimezone={reportTimezone}
        onCompletionClick={handleCompletionClick}
        onBlur={handleBlur}
      />,
      element,
    ),
  ];
}

export function tooltip(element: HTMLElement) {
  function getPosition(state: EditorState) {
    const pos = state.selection.main.head;
    const source = state.doc.toString();
    const token = tokenAtPos(source, pos);

    return token?.start ?? pos;
  }

  function create() {
    const dom = document.createElement("div");
    dom.append(element);
    return { dom, offset: { x: 0, y: 5 } };
  }

  function getCursorTooltips(state: EditorState): readonly TooltipView[] {
    return [
      {
        pos: getPosition(state),
        above: false,
        strictSide: true,
        arrow: false,
        create,
      },
    ];
  }

  return StateField.define<readonly TooltipView[]>({
    create: getCursorTooltips,
    update(_, transaction) {
      return getCursorTooltips(transaction.state);
    },
    provide: f => showTooltip.computeN([f], state => state.field(f)),
  });
}
