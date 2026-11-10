import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

import { isInCode } from "./cursor-context";

export const PROMPT_TRIGGER = "@";

const openPrompt = StateEffect.define<number>();
const closePrompt = StateEffect.define<null>();

/** The position of the open prompt in the document, or null. */
const promptField = StateField.define<number | null>({
  create: () => null,
  update(pos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openPrompt)) {
        return effect.value;
      }
      if (effect.is(closePrompt)) {
        return null;
      }
    }
    if (pos == null) {
      return null;
    }
    // An edit or a click in the code closes the prompt.
    if (tr.docChanged || tr.selection != null) {
      return null;
    }
    return pos;
  },
});

class PromptWidget extends WidgetType {
  constructor(private readonly container: HTMLElement) {
    super();
  }

  toDOM() {
    return this.container;
  }

  eq(other: PromptWidget) {
    return other.container === this.container;
  }

  // The input in the widget handles its own keys and clicks.
  ignoreEvent() {
    return true;
  }
}

export function closeInlinePrompt(view: EditorView) {
  const pos = view.state.field(promptField, false);
  if (pos == null) {
    return;
  }
  view.dispatch({ effects: closePrompt.of(null) });
  view.focus();
  view.dispatch({ selection: { anchor: pos } });
}

/**
 * Typing "@" in code opens a prompt to the AI at the cursor. The text after it
 * goes to the prompt in `container`, not to the code.
 */
export function inlinePrompt({
  container,
  onChange,
}: {
  container: HTMLElement;
  /** Called with the position of the prompt when it opens, and null when it closes. */
  onChange: (pos: number | null) => void;
}) {
  return [
    promptField,
    EditorView.decorations.compute([promptField], (state) => {
      const pos = state.field(promptField);
      return pos == null
        ? Decoration.none
        : Decoration.set(
            Decoration.widget({
              widget: new PromptWidget(container),
              side: 1,
            }).range(pos),
          );
    }),
    EditorView.inputHandler.of((view, from, to, text) => {
      if (
        text !== PROMPT_TRIGGER ||
        view.state.field(promptField) != null ||
        !isInCode(view.state.doc.sliceString(0, from))
      ) {
        return false;
      }
      view.dispatch({ effects: openPrompt.of(to) });
      return true;
    }),
    EditorView.updateListener.of((update) => {
      // The field is missing from a state before a reconfiguration.
      const pos = update.state.field(promptField, false) ?? null;
      if (pos !== (update.startState.field(promptField, false) ?? null)) {
        onChange(pos);
      }
    }),
  ];
}
