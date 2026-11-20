import { type Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

/**
 * Version D: Backspace on empty code calls `onExit`, which goes back to the
 * AI prompt. There is no "=" before the code.
 */
export function exitOnBackspace(onExit: () => void): Extension {
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
