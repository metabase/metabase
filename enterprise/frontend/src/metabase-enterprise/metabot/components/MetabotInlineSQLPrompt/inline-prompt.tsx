import { StateEffect, StateField } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";

import { InlinePromptView } from "./InlinePromptView";
import S from "./InlinePromptView.module.css";

export type InlinePromptOptions = {
  placeholder?: string;
  suggestionModels: readonly SuggestionModel[];
  onSubmit: (value: string) => Promise<void>;
  onCancel: () => void;
};

type PortalTarget = {
  container: HTMLElement;
  view: EditorView;
};

type TogglePromptPayload = {
  options: InlinePromptOptions;
  view: EditorView;
};

const togglePromptEffect = StateEffect.define<TogglePromptPayload>();
const hidePromptEffect = StateEffect.define<void>();

class InlinePromptWidget extends WidgetType {
  constructor(
    private readonly onMount: (target: PortalTarget) => void,
    private readonly onUnmount: () => void,
    private readonly view: EditorView,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = S.inlinePromptWrapper;
    this.onMount({ container, view: this.view });
    return container;
  }

  destroy(): void {
    this.onUnmount();
  }

  eq(): boolean {
    return false; // Always recreate to ensure fresh callbacks
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function useInlinePrompt(options: InlinePromptOptions) {
  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);

  const extensions = useMemo(() => {
    const field = StateField.define<{
      decorations: DecorationSet;
      visible: boolean;
    }>({
      create() {
        return { decorations: Decoration.none, visible: false };
      },

      update(state, transaction) {
        for (const effect of transaction.effects) {
          if (
            (effect.is(togglePromptEffect) && state.visible) ||
            effect.is(hidePromptEffect)
          ) {
            return { decorations: Decoration.none, visible: false };
          }

          if (effect.is(togglePromptEffect)) {
            const handleMount = setPortalTarget;
            const handleUnmount = () => setPortalTarget(null);
            const decoration = Decoration.widget({
              widget: new InlinePromptWidget(
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

    return [
      field,
      keymap.of([
        {
          key: "Mod-e",
          run: (view) => {
            view.dispatch({
              effects: togglePromptEffect.of({ options, view }),
            });
            return true;
          },
        },
      ]),
    ];
  }, [options]);

  const hidePrompt = useCallback(() => {
    portalTarget?.view.dispatch({ effects: hidePromptEffect.of() });
    portalTarget?.view.focus();
  }, [portalTarget]);

  const handleSubmit = useCallback(
    async (value: string) => {
      await options.onSubmit(value);
      hidePrompt();
    },
    [options, hidePrompt],
  );

  const handleCancel = useCallback(() => {
    options.onCancel();
    hidePrompt();
  }, [options, hidePrompt]);

  const portalElement = portalTarget
    ? createPortal(
        <InlinePromptView
          placeholder={options.placeholder}
          suggestionModels={options.suggestionModels}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />,
        portalTarget.container,
      )
    : null;

  return { extensions, portalElement };
}
