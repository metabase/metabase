import { StateEffect, StateField } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { useMemo } from "react";

import S from "./CodeMirrorEditor.module.css";

export type InlinePromptOptions = {
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

const togglePromptEffect = StateEffect.define<InlinePromptOptions>();
const hidePromptEffect = StateEffect.define<void>();

class InlinePromptWidget extends WidgetType {
  constructor(
    private readonly placeholder: string,
    private readonly onSubmit: (value: string) => void,
    private readonly onCancel: () => void,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = S.inlinePromptWrapper;

    const input = document.createElement("input");
    input.type = "text";
    input.className = S.inlinePromptInput;
    input.placeholder = this.placeholder;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const value = input.value;
        input.value = "";
        this.onSubmit(value);
        view.dispatch({ effects: hidePromptEffect.of() });
        view.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.onCancel();
        view.dispatch({ effects: hidePromptEffect.of() });
        view.focus();
      }
    });

    input.addEventListener("mousedown", (e) => e.stopPropagation());

    wrapper.appendChild(input);
    requestAnimationFrame(() => input.focus());

    return wrapper;
  }

  eq(other: InlinePromptWidget): boolean {
    return (
      this.placeholder === other.placeholder &&
      this.onSubmit === other.onSubmit &&
      this.onCancel === other.onCancel
    );
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function inlinePromptField() {
  return StateField.define<{ decorations: DecorationSet; visible: boolean }>({
    create() {
      return { decorations: Decoration.none, visible: false };
    },
    update(state, transaction) {
      let { decorations, visible } = state;
      decorations = decorations.map(transaction.changes);

      for (const effect of transaction.effects) {
        if (effect.is(togglePromptEffect)) {
          if (visible) {
            // Hide the prompt
            decorations = Decoration.none;
            visible = false;
          } else {
            // Show the prompt at cursor line
            const { placeholder, onSubmit, onCancel } = effect.value;
            const cursorPos = transaction.state.selection.main.head;
            const line = transaction.state.doc.lineAt(cursorPos);

            const widget = Decoration.widget({
              widget: new InlinePromptWidget(placeholder, onSubmit, onCancel),
              block: true,
              side: -1,
            });

            decorations = Decoration.set([widget.range(line.from)]);
            visible = true;
          }
        } else if (effect.is(hidePromptEffect)) {
          decorations = Decoration.none;
          visible = false;
        }
      }

      return { decorations, visible };
    },
    provide: (field) =>
      EditorView.decorations.from(field, (state) => state.decorations),
  });
}

export function useInlinePrompt(options: InlinePromptOptions | undefined) {
  return useMemo(() => {
    if (!options) {
      return [];
    }

    return [
      inlinePromptField(),
      keymap.of([
        {
          key: "Mod-k",
          run: (view) => {
            view.dispatch({ effects: togglePromptEffect.of(options) });
            return true;
          },
        },
      ]),
    ];
  }, [options]);
}
