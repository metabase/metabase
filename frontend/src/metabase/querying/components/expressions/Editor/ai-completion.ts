import { completionStatus } from "@codemirror/autocomplete";
import {
  type ChangeSet,
  type EditorState,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

import S from "./Editor.module.css";

export type CompletionRequest = { prefix: string; suffix: string };

export type FetchCompletion = (request: CompletionRequest) => {
  promise: Promise<string>;
  abort: () => void;
};

type Suggestion = { pos: number; text: string };

const setSuggestion = StateEffect.define<Suggestion | null>();

const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(suggestion, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSuggestion)) {
        return effect.value;
      }
    }
    if (suggestion == null) {
      return null;
    }
    if (tr.docChanged) {
      return typeThrough(suggestion, tr.changes, tr.state.selection.main.head);
    }
    const { main } = tr.state.selection;
    return main.empty && main.head === suggestion.pos ? suggestion : null;
  },
});

/**
 * Keep the suggestion while the user types the same text. A typed bracket or
 * quote can come with its closing pair after the cursor; the pair must then be
 * the end of the suggestion, and the suggestion drops it.
 */
function typeThrough(
  suggestion: Suggestion,
  changes: ChangeSet,
  head: number,
): Suggestion | null {
  const inserts: { from: number; to: number; text: string }[] = [];
  changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    inserts.push({ from, to, text: inserted.toString() });
  });
  if (inserts.length !== 1) {
    return null;
  }
  const [{ from, to, text }] = inserts;
  const typed = text.slice(0, head - from);
  const closing = text.slice(head - from);
  if (
    from !== suggestion.pos ||
    to !== from ||
    typed === "" ||
    !suggestion.text.startsWith(typed) ||
    !suggestion.text.endsWith(closing)
  ) {
    return null;
  }
  const rest = suggestion.text.slice(
    typed.length,
    suggestion.text.length - closing.length,
  );
  return rest === "" ? null : { pos: head, text: rest };
}

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: GhostWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = S.ghost;
    span.textContent = this.text;
    return span;
  }
}

function getVisibleSuggestion(state: EditorState) {
  // The autocomplete list owns Tab while it is open.
  if (completionStatus(state) === "active") {
    return null;
  }
  return state.field(suggestionField);
}

const ghostDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    update(update: ViewUpdate) {
      const suggestion = getVisibleSuggestion(update.state);
      this.decorations = suggestion
        ? Decoration.set(
            Decoration.widget({
              widget: new GhostWidget(suggestion.text),
              side: 1,
            }).range(suggestion.pos),
          )
        : Decoration.none;
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function acceptSuggestion(view: EditorView) {
  const suggestion = getVisibleSuggestion(view.state);
  if (suggestion == null) {
    return false;
  }
  view.dispatch({
    changes: { from: suggestion.pos, insert: suggestion.text },
    selection: { anchor: suggestion.pos + suggestion.text.length },
    effects: setSuggestion.of(null),
    // Not an "input" event, so that the accepted text starts no new request.
    userEvent: "ai-completion.accept",
  });
  return true;
}

function dismissSuggestion(view: EditorView) {
  if (view.state.field(suggestionField) == null) {
    return false;
  }
  view.dispatch({ effects: setSuggestion.of(null) });
  return true;
}

function canRequest(state: EditorState) {
  const { main } = state.selection;
  if (!main.empty || state.doc.length === 0) {
    return false;
  }
  // Do not complete in the middle of a word.
  const next = state.doc.sliceString(main.head, main.head + 1);
  return !/[\p{L}\p{N}_]/u.test(next);
}

function fetcher(fetchCompletion: FetchCompletion, delayMs: number) {
  return ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined;
      request: ReturnType<FetchCompletion> | null = null;

      constructor(readonly view: EditorView) {}

      update(update: ViewUpdate) {
        const isEdit = update.transactions.some(
          (tr) => tr.isUserEvent("input") || tr.isUserEvent("delete"),
        );
        if (!isEdit) {
          if (update.selectionSet) {
            this.cancel();
          }
          return;
        }
        this.cancel();
        if (update.state.field(suggestionField) != null) {
          return;
        }
        this.timer = setTimeout(() => this.start(), delayMs);
      }

      start() {
        const { state } = this.view;
        if (!canRequest(state)) {
          return;
        }
        const pos = state.selection.main.head;
        const doc = state.doc.toString();
        const request = fetchCompletion({
          prefix: doc.slice(0, pos),
          suffix: doc.slice(pos),
        });
        this.request = request;
        request.promise
          .then((text) => {
            const { state } = this.view;
            if (
              this.request !== request ||
              text === "" ||
              state.doc.toString() !== doc ||
              state.selection.main.head !== pos
            ) {
              return;
            }
            this.request = null;
            this.view.dispatch({
              effects: setSuggestion.of({ pos, text }),
            });
          })
          .catch(() => {
            // A failed or aborted completion shows nothing.
          });
      }

      cancel() {
        clearTimeout(this.timer);
        this.request?.abort();
        this.request = null;
      }

      destroy() {
        this.cancel();
      }
    },
  );
}

/**
 * Fill-in-the-middle completion: after a pause in typing, ask the AI for the
 * text at the cursor and show it as ghost text. Tab accepts it, Escape
 * dismisses it, and typing the same text keeps it.
 */
export function aiCompletion({
  fetchCompletion,
  delayMs,
}: {
  fetchCompletion: FetchCompletion;
  delayMs: number;
}) {
  return [
    suggestionField,
    ghostDecorations,
    fetcher(fetchCompletion, delayMs),
    // Keymaps run in a keydown handler of default precedence, after the shared
    // CodeMirror keymap that owns Tab. This handler runs before both.
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event, view) => {
          if (
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          ) {
            return false;
          }
          const isHandled =
            (event.key === "Tab" && acceptSuggestion(view)) ||
            (event.key === "Escape" && dismissSuggestion(view));
          if (isHandled) {
            event.preventDefault();
          }
          return isHandled;
        },
        blur: (_event, view) => {
          dismissSuggestion(view);
        },
      }),
    ),
  ];
}
