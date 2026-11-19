import { type Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

/**
 * Version F: Backspace on empty code calls `onExit`, which goes back to the
 * AI prompt. There's no "=" before the code: the mode switch shows the mode.
 */
export function codePrefix(onExit: () => void): Extension {
  return Prec.highest(
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
  );
}
