import { Editor } from "@tiptap/core";

import type { Token } from "../../model";
import { OR, pill } from "../../test-utils";
import { tokensToContent } from "../document";
import { createEditorExtensions } from "../extensions";

const A = pill("A");
const B = pill("B");

type SetupOpts = {
  stages: Token<string>[][];
};

const setup = ({ stages }: SetupOpts) => {
  const editor = new Editor({
    extensions: createEditorExtensions({ caretClassName: "caret" }),
    content: tokensToContent(stages),
  });
  return { editor };
};

const findCaretIndex = (dom: HTMLElement) =>
  [...dom.children].findIndex((child) => child.matches(".caret"));

describe("caret", () => {
  it("is drawn at the caret position", () => {
    const { editor } = setup({ stages: [[A, OR, B]] });
    editor.commands.setTextSelection(2);
    expect(findCaretIndex(editor.view.dom)).toBe(2);
  });

  it("is not drawn when a pill is selected", () => {
    const { editor } = setup({ stages: [[A, OR, B]] });
    editor.commands.setNodeSelection(0);
    expect(editor.view.dom.querySelector(".caret")).toBeNull();
  });
});
