import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

export const PROMPT_TRIGGER = "?";

/** True when the text before the cursor ends in code, not in a text or a column name. */
function isInCode(prefix: string) {
  let close: string | null = null;
  for (let i = 0; i < prefix.length; i++) {
    const char = prefix[i];
    if (close == null) {
      close = char === "[" ? "]" : char === '"' || char === "'" ? char : null;
    } else if (char === "\\") {
      i++;
    } else if (char === close) {
      close = null;
    }
  }
  return close == null;
}

type OpenPrompt = {
  /** Where the prompt is in the document. */
  pos: number;
  /** On its own line under the code, rather than inline at `pos`. */
  isOnNewLine: boolean;
};

const openPrompt = StateEffect.define<OpenPrompt>();
const closePrompt = StateEffect.define<null>();

/** The open prompt, or null. */
const promptField = StateField.define<OpenPrompt | null>({
  create: () => null,
  update(prompt, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openPrompt)) {
        return effect.value;
      }
      if (effect.is(closePrompt)) {
        return null;
      }
    }
    if (prompt == null) {
      return null;
    }
    // An edit or a click in the code closes the prompt.
    if (tr.docChanged || tr.selection != null) {
      return null;
    }
    return prompt;
  },
});

class PromptWidget extends WidgetType {
  constructor(
    private readonly container: HTMLElement,
    private readonly isOnNewLine: boolean,
  ) {
    super();
  }

  toDOM() {
    if (!this.isOnNewLine) {
      return this.container;
    }
    // A line of its own under the code.
    const line = document.createElement("div");
    line.className = "cm-line";
    line.append(this.container);
    return line;
  }

  eq(other: PromptWidget) {
    return (
      other.container === this.container &&
      other.isOnNewLine === this.isOnNewLine
    );
  }

  // The input in the widget handles its own keys and clicks.
  ignoreEvent() {
    return true;
  }
}

/**
 * Opens the prompt after the code, like typing "?" there. It goes on a line
 * of its own under the code, without changing the code itself.
 */
export function openInlinePromptAtEnd(view: EditorView) {
  const pos = view.state.doc.length;
  view.dispatch({
    selection: { anchor: pos },
    effects: openPrompt.of({ pos, isOnNewLine: pos > 0 }),
  });
}

export function closeInlinePrompt(view: EditorView) {
  const prompt = view.state.field(promptField, false);
  if (prompt == null) {
    return;
  }
  view.dispatch({ effects: closePrompt.of(null) });
  view.focus();
  view.dispatch({ selection: { anchor: prompt.pos } });
}

/**
 * Typing "?" in code opens a prompt to the AI at the cursor. The text after it
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
      const prompt = state.field(promptField);
      return prompt == null
        ? Decoration.none
        : Decoration.set(
            Decoration.widget({
              widget: new PromptWidget(container, prompt.isOnNewLine),
              side: 1,
              block: prompt.isOnNewLine,
            }).range(prompt.pos),
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
      view.dispatch({
        effects: openPrompt.of({ pos: to, isOnNewLine: false }),
      });
      return true;
    }),
    EditorView.updateListener.of((update) => {
      // The field is missing from a state before a reconfiguration.
      const pos = update.state.field(promptField, false)?.pos ?? null;
      const prevPos = update.startState.field(promptField, false)?.pos ?? null;
      if (pos !== prevPos) {
        onChange(pos);
      }
    }),
  ];
}
