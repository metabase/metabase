import { closeBrackets, deleteBracketPair } from "@codemirror/autocomplete";
import {
  cursorCharLeft,
  deleteCharBackward,
  deleteCharForward,
} from "@codemirror/commands";
import { LRLanguage } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

import { parser } from "metabase/querying/expressions/tokenizer/parser";

import { formulaTokens } from "./formula-tokens";

const CARET = "|";

let cleanup: (() => void) | undefined;

type SetupOpts = {
  /** The formula, with `|` where the caret is. */
  formula: string;
};

function setup({ formula }: SetupOpts) {
  const container = document.createElement("div");
  document.body.append(container);
  const view = new EditorView({
    parent: container,
    doc: formula.replace(CARET, ""),
    selection: { anchor: formula.indexOf(CARET) },
    extensions: [
      LRLanguage.define({ parser }),
      closeBrackets(),
      formulaTokens(),
    ],
  });

  cleanup = () => {
    view.destroy();
    container.remove();
  };

  return { view };
}

function getFormula(view: EditorView) {
  const { doc, selection } = view.state;
  const head = selection.main.head;
  return doc.sliceString(0, head) + CARET + doc.sliceString(head);
}

// the order the editor's keymaps run them in: the bracket pair first
function pressBackspace(view: EditorView) {
  if (!deleteBracketPair(view)) {
    deleteCharBackward(view);
  }
  return getFormula(view);
}

describe("formulaTokens", () => {
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("deletes a complete column reference in one backspace", () => {
    const { view } = setup({ formula: "Sum([Total]|)" });

    expect(pressBackspace(view)).toBe("Sum(|)");
  });

  it("deletes a complete column reference in one forward delete", () => {
    const { view } = setup({ formula: "Sum(|[Total])" });

    deleteCharForward(view);

    expect(getFormula(view)).toBe("Sum(|)");
  });

  it("moves the caret past a complete column reference in one step", () => {
    const { view } = setup({ formula: "Sum([Total]|) + 1" });

    cursorCharLeft(view);

    expect(getFormula(view)).toBe("Sum(|[Total]) + 1");
  });

  it("backspaces a column reference being typed one character at a time, without stranding its brackets", () => {
    const { view } = setup({ formula: "Sum([To|])" });

    expect([
      pressBackspace(view),
      pressBackspace(view),
      pressBackspace(view),
      pressBackspace(view),
    ]).toEqual(["Sum([T|])", "Sum([|])", "Sum(|)", "Sum|"]);
  });

  describe("function names", () => {
    it("deletes a function's name in one backspace", () => {
      const { view } = setup({ formula: "Average|([Total])" });

      expect(pressBackspace(view)).toBe("|([Total])");
    });

    it("deletes a function's name in one backspace once its parentheses are gone", () => {
      const { view } = setup({ formula: "Sum|[Total]" });

      expect(pressBackspace(view)).toBe("|[Total]");
    });

    it("moves the caret past a function's name in one step", () => {
      const { view } = setup({ formula: "Sum|([Total])" });

      cursorCharLeft(view);

      expect(getFormula(view)).toBe("|Sum([Total])");
    });

    it("backspaces one character at a time with the caret inside a function's name", () => {
      const { view } = setup({ formula: "Aver|age([Total])" });

      expect(pressBackspace(view)).toBe("Ave|age([Total])");
    });

    it("backspaces one character at a time after a name that isn't a function", () => {
      const { view } = setup({ formula: "Averag|" });

      expect(pressBackspace(view)).toBe("Avera|");
    });
  });
});
