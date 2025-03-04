import type { CompletionContext } from "@codemirror/autocomplete";

import type { Completion, CompletionResult, Shortcut } from "./types";

export type Options = {
  shortcuts?: Shortcut[];
};

export function suggestShortcuts({ shortcuts = [] }: Options) {
  const completions: Completion[] = shortcuts.map(shortcut => ({
    label: shortcut.name,
    icon: shortcut.icon,
    apply: shortcut.action,
    section: "shortcuts",
  }));

  if (completions.length === 0) {
    return null;
  }

  return function (context: CompletionContext): CompletionResult | null {
    if (context.state.doc.toString() !== "") {
      return null;
    }

    return {
      from: context.pos,
      options: completions,
    };
  };
}
