import { type Extension, Prec } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  placeholder,
} from "@codemirror/view";
import { t } from "ttag";

class PrefixWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const prefix = document.createElement("span");
    prefix.className = "cm-codePrefix";
    prefix.textContent = "=";
    prefix.setAttribute("aria-hidden", "true");
    return prefix;
  }
}

/**
 * Version F: the "=" that starts the code, like in a spreadsheet, and the
 * "Write an expression" placeholder after it. The "=" isn't part of the
 * text, so positions, errors and templates don't change. Backspace on empty
 * code calls `onExit`, which goes back to the AI prompt.
 */
export function codePrefix(onExit: () => void): Extension {
  const prefix = Decoration.set([
    Decoration.widget({ widget: new PrefixWidget(), side: -1 }).range(0),
  ]);
  return [
    EditorView.decorations.of(prefix),
    placeholder(t`Write an expression`),
    Prec.highest(
      keymap.of([
        {
          key: "Backspace",
          run: (view) => {
            if (view.state.doc.length > 0) {
              return false;
            }
            onExit();
            return true;
          },
        },
      ]),
    ),
  ];
}
