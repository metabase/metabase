import { completionStatus } from "@codemirror/autocomplete";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useMemo } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { hasActiveSnippet } from "metabase/querying/components/expressions/Editor/utils";

type Handlers = {
  onSubmit: () => void;
  onCancel: () => void;
  onNavigate: (direction: "backward" | "forward") => boolean;
};

export function useFormulaKeymap(handlers: Handlers) {
  const latest = useLatest(handlers);
  return useMemo(() => {
    const isCompleting = (view: EditorView) =>
      completionStatus(view.state) === "active";
    return [
      EditorState.transactionFilter.of((transaction) =>
        transaction.newDoc.lines > 1 ? [] : transaction,
      ),
      EditorView.contentAttributes.of({ "aria-label": t`Formula` }),
      // DOM handlers give formula navigation priority over the editor's Tab keymaps.
      Prec.highest(
        EditorView.domEventHandlers({
          keydown: (event, view) => {
            if (
              event.key !== "Tab" ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              isCompleting(view) ||
              hasActiveSnippet(view.state)
            ) {
              return false;
            }
            if (view.state.doc.toString().trim().length === 0) {
              event.preventDefault();
              latest.current.onCancel();
              return true;
            }
            const handled = latest.current.onNavigate(
              event.shiftKey ? "backward" : "forward",
            );
            if (handled) {
              event.preventDefault();
            }
            return handled;
          },
        }),
      ),
      Prec.highest(
        keymap.of([
          {
            key: "Enter",
            run: (view) => {
              if (isCompleting(view)) {
                return false;
              }
              latest.current.onSubmit();
              return true;
            },
          },
          {
            key: "Mod-Enter",
            run: () => {
              latest.current.onSubmit();
              return true;
            },
          },
          {
            key: "Escape",
            run: (view) => {
              if (isCompleting(view)) {
                return false;
              }
              latest.current.onCancel();
              return true;
            },
          },
          {
            key: "/",
            run: (view) => {
              if (view.state.doc.length > 0) {
                return false;
              }
              latest.current.onCancel();
              return true;
            },
          },
        ]),
      ),
    ];
  }, [latest]);
}
