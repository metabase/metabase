import { history, redo, undo } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";
import { keymap, placeholder } from "@codemirror/view";
import { t } from "ttag";

import type { MetricSearchDropdownRef } from "../MetricSearchDropdown";

import { errorHighlight } from "./errorHighlight";
import { metricTokenHighlight } from "./metricTokenHighlight";
import { operatorHighlight } from "./operatorHighlight";

type EditorExtensionRefs = {
  handleRunRef: { current: () => void };
  dropdownRef: React.RefObject<MetricSearchDropdownRef>;
};

export function buildEditorExtensions(
  formulaEntityCount: number,
  refs: EditorExtensionRefs,
): Extension[] {
  return [
    history(),
    operatorHighlight,
    errorHighlight,
    metricTokenHighlight,
    placeholder(formulaEntityCount === 0 ? t`Search for metrics...` : ""),
    // Prevent Enter from creating newlines; trigger run when dirty.
    keymap.of([
      { key: "Mod-z", run: undo, preventDefault: true },
      { key: "Mod-Shift-z", run: redo, preventDefault: true },
      {
        key: "Enter",
        run: () => {
          refs.handleRunRef.current();
          return true;
        },
      },
      // don't move the cursor when using the arrow keys to navigate the dropdown
      {
        key: "ArrowDown",
        run: () => refs.dropdownRef.current?.onArrowDown() ?? false,
      },
      {
        key: "ArrowUp",
        run: () => refs.dropdownRef.current?.onArrowUp() ?? false,
      },
    ]),
  ];
}
