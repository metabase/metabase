import {
  type EditorState,
  type Extension,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  type Tooltip as TooltipView,
  type ViewUpdate,
  showTooltip,
} from "@codemirror/view";
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { Tooltip } from "./Tooltip/Tooltip";
import { tokenAtPos } from "./suggestions";

type TooltipOptions = {
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const element = useMemo(() => document.createElement("div"), []);

  const [update, setUpdate] = useState<ViewUpdate | null>(null);
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
      EditorView.updateListener.of(update => setUpdate(update)),
    ],
    [element, handleBlur, handleFocus],
  );

  return [
    extensions,
    createPortal(
      update && (
        <Tooltip
          ref={tooltipRef}
          state={update.state}
          view={update.view}
          hasFocus={hasFocus}
          query={query}
          metadata={metadata}
          reportTimezone={reportTimezone}
          onBlur={handleBlur}
        />
      ),
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
