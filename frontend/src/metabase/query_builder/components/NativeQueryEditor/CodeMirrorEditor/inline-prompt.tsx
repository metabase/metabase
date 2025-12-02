import { StateEffect, StateField } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import type { Store } from "@reduxjs/toolkit";
import { useMemo } from "react";
import { type Root, createRoot } from "react-dom/client";

import { useStore } from "metabase/lib/redux";
import { MetabaseReduxProvider } from "metabase/lib/redux/custom-context";
import { ThemeProvider } from "metabase/ui";
import { ThemeProviderContext } from "metabase/ui/components/theme/ThemeProvider/context";
// TODO: Use the plugin system to inject enterprise components instead of importing directly
// eslint-disable-next-line no-restricted-imports
import { InlinePromptView } from "metabase-enterprise/metabot/components/MetabotPromptInput";
// eslint-disable-next-line no-restricted-imports
import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";

import S from "./CodeMirrorEditor.module.css";

export type InlinePromptOptions = {
  placeholder?: string;
  suggestionModels: SuggestionModel[];
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

type InlinePromptOptionsWithStore = InlinePromptOptions & {
  store: Store;
};

const togglePromptEffect = StateEffect.define<InlinePromptOptionsWithStore>();
const hidePromptEffect = StateEffect.define<void>();

class InlinePromptWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    private readonly store: Store,
    private readonly placeholder: string | undefined,
    private readonly suggestionModels: SuggestionModel[],
    private readonly onSubmit: (value: string) => void,
    private readonly onCancel: () => void,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = S.inlinePromptWrapper;

    const handleSubmit = (value: string) => {
      this.onSubmit(value);
      view.dispatch({ effects: hidePromptEffect.of() });
      view.focus();
    };

    const handleCancel = () => {
      this.onCancel();
      view.dispatch({ effects: hidePromptEffect.of() });
      view.focus();
    };

    this.root = createRoot(wrapper);
    this.root.render(
      <MetabaseReduxProvider store={this.store}>
        <ThemeProviderContext.Provider value={{ withCssVariables: false }}>
          <ThemeProvider>
            <InlinePromptView
              placeholder={this.placeholder}
              suggestionModels={this.suggestionModels}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          </ThemeProvider>
        </ThemeProviderContext.Provider>
      </MetabaseReduxProvider>,
    );

    return wrapper;
  }

  destroy(): void {
    if (this.root) {
      const root = this.root;
      this.root = null;
      setTimeout(() => root.unmount(), 0);
    }
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
            decorations = Decoration.none;
            visible = false;
          } else {
            const { store, placeholder, suggestionModels, onSubmit, onCancel } =
              effect.value;
            const cursorPos = transaction.state.selection.main.head;
            const line = transaction.state.doc.lineAt(cursorPos);

            const widget = Decoration.widget({
              widget: new InlinePromptWidget(
                store,
                placeholder,
                suggestionModels,
                onSubmit,
                onCancel,
              ),
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
  const store = useStore();

  return useMemo(() => {
    if (!options) {
      return [];
    }

    const optionsWithStore: InlinePromptOptionsWithStore = {
      ...options,
      store,
    };

    return [
      inlinePromptField(),
      keymap.of([
        {
          key: "Mod-k",
          run: (view) => {
            view.dispatch({ effects: togglePromptEffect.of(optionsWithStore) });
            return true;
          },
        },
      ]),
    ];
  }, [options, store]);
}
