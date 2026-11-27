import { closeBrackets, deleteBracketPair } from "@codemirror/autocomplete";
import { deleteCharBackward, deleteCharForward } from "@codemirror/commands";
import { LRLanguage } from "@codemirror/language";
import { EditorView, runScopeHandlers } from "@codemirror/view";

import { parser } from "metabase/querying/expressions/tokenizer/parser";

import { parenPairDeletion } from "./formula-parens";
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
      parenPairDeletion,
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

// the editor's keymaps, then the default deletion when none of them handles the key
function press(view: EditorView, key: "Backspace" | "Delete") {
  const event = new KeyboardEvent("keydown", { key });
  if (!runScopeHandlers(view, event, "editor") && !deleteBracketPair(view)) {
    if (key === "Backspace") {
      deleteCharBackward(view);
    } else {
      deleteCharForward(view);
    }
  }
  return getFormula(view);
}

describe("parenPairDeletion", () => {
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it.each([
    ["Sum(|[Total])", "Sum|[Total]"],
    [
      "Sum(|[Total] * (1 - [Discount])) + 1",
      "Sum|[Total] * (1 - [Discount]) + 1",
    ],
    ['concat(|[Price (USD)], ")")', 'concat|[Price (USD)], ")"'],
  ])(
    "backspaces the matching parenthesis pair in %s, keeping its arguments",
    (formula, expected) => {
      const { view } = setup({ formula });
      expect(press(view, "Backspace")).toBe(expected);
    },
  );

  it("deletes the closing paren along with a forward-deleted opening one", () => {
    const { view } = setup({ formula: "Sum|([Total])" });
    expect(press(view, "Delete")).toBe("Sum|[Total]");
  });

  it("deletes an unclosed opening paren on its own", () => {
    const { view } = setup({ formula: "Sum(|[Total]" });

    expect(press(view, "Backspace")).toBe("Sum|[Total]");
  });

  it("backspaces a whole function call without stranding a closing paren", () => {
    const { view } = setup({ formula: "Sum(|[Total])" });

    expect([press(view, "Backspace"), press(view, "Backspace")]).toEqual([
      "Sum|[Total]",
      "|[Total]",
    ]);
  });
});
