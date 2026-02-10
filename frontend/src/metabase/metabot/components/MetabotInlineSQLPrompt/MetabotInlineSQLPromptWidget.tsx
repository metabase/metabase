import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";

import S from "./MetabotInlineSQLPrompt.module.css";

export type PortalTarget = {
  container: HTMLElement;
  view: EditorView;
};

type TogglePromptPayload = {
  view: EditorView;
};

export const toggleEffect = StateEffect.define<TogglePromptPayload>();
export const hideEffect = StateEffect.define<void>();

export class MetabotInlinePromptWidget extends WidgetType {
  constructor(
    private readonly onMount: (target: PortalTarget) => void,
    private readonly onUnmount: () => void,
    private readonly view: EditorView,
  ) {
    super();
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = S.widget;
    this.onMount({ container, view: this.view });
    return container;
  }

  destroy() {
    this.onUnmount();
  }

  eq() {
    return false;
  }

  ignoreEvent() {
    return true;
  }
}

export function createPromptInputExtension(
  setPortalTarget: (target: PortalTarget | null) => void,
) {
  return StateField.define<{
    decorations: DecorationSet;
    visible: boolean;
  }>({
    create() {
      return { decorations: Decoration.none, visible: false };
    },

    update(state, transaction) {
      for (const effect of transaction.effects) {
        if (
          (effect.is(toggleEffect) && state.visible) ||
          effect.is(hideEffect)
        ) {
          return { decorations: Decoration.none, visible: false };
        }

        if (effect.is(toggleEffect)) {
          const handleMount = setPortalTarget;
          const handleUnmount = () => setPortalTarget(null);
          const decoration = Decoration.widget({
            widget: new MetabotInlinePromptWidget(
              handleMount,
              handleUnmount,
              effect.value.view,
            ),
            block: true,
            side: -1,
          });

          const cursorPos = transaction.state.selection.main.head;
          const line = transaction.state.doc.lineAt(cursorPos);
          return {
            decorations: Decoration.set([decoration.range(line.from)]),
            visible: true,
          };
        }
      }
      return state;
    },

    provide: (f) => EditorView.decorations.from(f, (s) => s.decorations),
  });
}
