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

  it.each([
    ["Sum([Total]|)", "Sum(|)"],
    ["Average|([Total])", "|([Total])"],
    ["Sum|[Total]", "|[Total]"],
  ])(
    "deletes the complete token in %s in one backspace",
    (formula, expected) => {
      const { view } = setup({ formula });
      expect(pressBackspace(view)).toBe(expected);
    },
  );

  it("deletes a complete column reference in one forward delete", () => {
    const { view } = setup({ formula: "Sum(|[Total])" });
    deleteCharForward(view);
    expect(getFormula(view)).toBe("Sum(|)");
  });

  it.each([
    ["Sum([Total]|) + 1", "Sum(|[Total]) + 1"],
    ["Sum|([Total])", "|Sum([Total])"],
  ])("moves past the complete token in %s in one step", (formula, expected) => {
    const { view } = setup({ formula });
    cursorCharLeft(view);
    expect(getFormula(view)).toBe(expected);
  });

  it("backspaces a column being typed one character at a time, without stranding its brackets", () => {
    const { view } = setup({ formula: "Sum([To|])" });
    expect([
      pressBackspace(view),
      pressBackspace(view),
      pressBackspace(view),
      pressBackspace(view),
    ]).toEqual(["Sum([T|])", "Sum([|])", "Sum(|)", "Sum|"]);
  });

  it.each([
    ["Aver|age([Total])", "Ave|age([Total])"],
    ["Averag|", "Avera|"],
  ])(
    "backspaces one character while editing a function in %s",
    (formula, expected) => {
      const { view } = setup({ formula });
      expect(pressBackspace(view)).toBe(expected);
    },
  );
});
