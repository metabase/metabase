import { type Extension, Prec } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap } from "@codemirror/view";

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
 * Version B: the "=" that starts the code, like in a spreadsheet. It isn't
 * part of the text, so positions, errors and templates are the same as in A.
 * Backspace on empty code calls `onExit`, which goes back to the AI prompt.
 */
export function codePrefix(onExit: () => void): Extension {
  const prefix = Decoration.set([
    Decoration.widget({ widget: new PrefixWidget(), side: -1 }).range(0),
  ]);
  return [
    EditorView.decorations.of(prefix),
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
