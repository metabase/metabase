import {
  acceptCompletion,
  completionStatus,
  hasNextSnippetField,
  hasPrevSnippetField,
  nextSnippetField,
  pickedCompletion,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  type EditorState,
  type Extension,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { tokenAtPos } from "./position";
import { FIELD, STRING, lexify } from "./pratt";

/** Quoted values that are options of a function, not something to fill in. */
const FIXED_KEYWORDS = new Set([
  "year",
  "quarter",
  "month",
  "week",
  "day",
  "hour",
  "minute",
  "second",
  "millisecond",
  "case-insensitive",
]);

/**
 * Turns a template such as `Sum([Amount])` into a CodeMirror snippet whose fields
 * are its columns and quoted values. Repeated values share a field, so filling
 * one in fills them all.
 *
 * Fields are numbered because CodeMirror would otherwise read `"0"` as a field
 * number. The final empty field exists because a snippet ends on reaching its
 * last field, which would otherwise end the template on its last blank.
 */
export function expressionTemplateSnippet(code: string) {
  const sequenceByText = new Map<string, number>();
  let nextSequence = 1;

  const toField = (text: string) => {
    let sequence = text === "" ? undefined : sequenceByText.get(text);
    if (sequence == null) {
      sequence = nextSequence++;
      sequenceByText.set(text, sequence);
    }
    return `\${${sequence}:${text}}`;
  };

  let template = "";
  let position = 0;

  for (const { type, start, end } of lexify(code)) {
    const isBlankText =
      type === STRING && !FIXED_KEYWORDS.has(code.slice(start + 1, end - 1));
    if (type !== FIELD && !isBlankText) {
      continue;
    }

    const from = type === FIELD ? start : start + 1;
    const to = type === FIELD ? end : end - 1;
    template += code.slice(position, from) + toField(code.slice(from, to));
    position = to;
  }

  const rest = code.slice(position);
  return nextSequence > 1 ? `${template}${rest}${toField("")}` : code;
}

const setTemplateActive = /* #__PURE__ */ StateEffect.define<boolean>();

const templateActive = /* #__PURE__ */ StateField.define<boolean>({
  create: () => false,
  update(isActive, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setTemplateActive)) {
        return effect.value;
      }
    }
    return (
      isActive &&
      (hasNextSnippetField(transaction.state) ||
        hasPrevSnippetField(transaction.state))
    );
  },
});

/** Which kind of blank the cursor is on while a template is being filled in. */
export function getTemplateFieldKind(
  state: EditorState,
): "column" | "text" | null {
  if (!state.field(templateActive, false)) {
    return null;
  }

  const { from, to, head } = state.selection.main;
  if (/^\[.*\]$/.test(state.sliceDoc(from, to))) {
    return "column";
  }

  const token = tokenAtPos(state.doc.toString(), head);
  return token?.type === STRING ? "text" : null;
}

function openColumnList(view: EditorView) {
  if (
    getTemplateFieldKind(view.state) === "column" &&
    completionStatus(view.state) == null
  ) {
    startCompletion(view);
  }
}

/** Inserts a template at the cursor and starts on its first blank. */
export function insertExpressionTemplate(view: EditorView, code: string) {
  const template = expressionTemplateSnippet(code);
  const { from, to } = view.state.selection.main;

  view.focus();
  snippet(template)(
    { state: view.state, dispatch: view.dispatch },
    null,
    from,
    to,
  );

  if (template !== code) {
    view.dispatch({ effects: setTemplateActive.of(true) });
    openColumnList(view);
  }
}

function confirmAndMoveOn(view: EditorView) {
  return acceptCompletion(view) || nextSnippetField(view);
}

export function expressionTemplates({
  activeClassName,
}: {
  activeClassName: string;
}): Extension {
  return [
    templateActive,

    EditorView.editorAttributes.compute([templateActive], (state) => ({
      class: state.field(templateActive) ? activeClassName : "",
    })),

    // Runs before every keymap, so that Tab confirms the highlighted column
    // instead of skipping past it.
    Prec.highest(
      EditorView.domEventHandlers({
        keydown(event, view) {
          const isConfirmKey = event.key === "Enter" || event.key === "Tab";
          const hasModifier =
            event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;

          if (
            !isConfirmKey ||
            hasModifier ||
            !view.state.field(templateActive)
          ) {
            return false;
          }

          event.preventDefault();
          return confirmAndMoveOn(view);
        },
      }),
    ),

    EditorView.updateListener.of((update) => {
      if (!update.state.field(templateActive)) {
        return;
      }

      // Covers every way of choosing a column, including clicking it. Choosing
      // a function starts its own snippet, so leave the cursor there.
      const pickedColumn = update.transactions.some((transaction) => {
        const completion = transaction.annotation(pickedCompletion);
        return completion != null && typeof completion.apply !== "function";
      });

      if (pickedColumn) {
        nextSnippetField(update.view);
      } else if (update.selectionSet) {
        openColumnList(update.view);
      }
    }),
  ];
}
