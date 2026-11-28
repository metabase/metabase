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
};

export function useFormulaKeymap(handlers: Handlers) {
  const latest = useLatest(handlers);
  return useMemo(() => {
    const isCompleting = (view: EditorView) =>
      completionStatus(view.state) === "active";
    return [
      EditorView.clipboardInputFilter.of((text) =>
        text.replace(/\r\n?|\n/g, " "),
      ),
      EditorState.transactionFilter.of((transaction) => {
        const { newDoc } = transaction;
        if (newDoc.lines === 1) {
          return transaction;
        }
        if (!transaction.isUserEvent("input.paste")) {
          return [];
        }
        // CodeMirror appends a newline after clipboard filtering for linewise paste.
        return [
          transaction,
          {
            changes: Array.from({ length: newDoc.lines - 1 }, (_, index) => {
              const from = newDoc.line(index + 1).to;
              return { from, to: from + 1, insert: " " };
            }),
            sequential: true,
          },
        ];
      }),
      EditorView.contentAttributes.of({ "aria-label": t`Formula` }),
      // DOM handlers cancel empty formulas before the editor's Tab keymaps.
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
            return false;
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
