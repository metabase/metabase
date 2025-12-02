import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { useMemo } from "react";

import S from "./CodeMirrorEditor.module.css";

export type InlinePromptOptions = {
  /** Line number (1-indexed) where the prompt should appear above */
  line: number;
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

const showPromptEffect = StateEffect.define<InlinePromptOptions>();
const hidePromptEffect = StateEffect.define<void>();

class InlinePromptWidget extends WidgetType {
  constructor(
    private readonly placeholder: string,
    private readonly onSubmit: (value: string) => void,
    private readonly onCancel: () => void,
  ) {
    super();
  }

  toDOM(): HTMLElement {
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
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.onCancel();
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
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(decorations, transaction) {
      decorations = decorations.map(transaction.changes);

      for (const effect of transaction.effects) {
        if (effect.is(showPromptEffect)) {
          const { line, placeholder, onSubmit, onCancel } = effect.value;
          const doc = transaction.state.doc;
          const targetLine = Math.min(Math.max(1, line), doc.lines);
          const lineInfo = doc.line(targetLine);

          const widget = Decoration.widget({
            widget: new InlinePromptWidget(placeholder, onSubmit, onCancel),
            block: true,
            side: -1,
          });

          decorations = Decoration.set([widget.range(lineInfo.from)]);
        } else if (effect.is(hidePromptEffect)) {
          decorations = Decoration.none;
        }
      }

      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

export function useInlinePrompt(options: InlinePromptOptions | undefined) {
  return useMemo(() => {
    if (!options) {
      return [inlinePromptField()];
    }

    let initialized = false;

    return [
      inlinePromptField(),
      EditorView.updateListener.of((update) => {
        if (!initialized) {
          initialized = true;
          update.view.dispatch({
            effects: showPromptEffect.of(options),
          });
        }
      }),
    ];
  }, [options]);
}
