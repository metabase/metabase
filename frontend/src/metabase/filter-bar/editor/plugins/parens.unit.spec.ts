import { Editor } from "@tiptap/core";

import type { Token } from "../../model";
import {
  CLOSE,
  OPEN,
  OR,
  findDraft,
  getStages,
  pill,
  type,
} from "../../test-utils";
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

describe("parens", () => {
  it("( after the last pill adds ( and its )", () => {
    const { editor } = setup({ stages: [[A, OR, B]] });
    editor.commands.setTextSelection(3);
    type(editor, "(");
    expect(getStages(editor)).toEqual([[A, OR, B, OPEN, CLOSE]]);
  });

  it("( before a pill adds no )", () => {
    const { editor } = setup({ stages: [[A, OR, B]] });
    editor.commands.setTextSelection(2);
    type(editor, "(");
    expect(getStages(editor)).toEqual([[A, OR, OPEN, B]]);
  });

  it("( before a ( adds no )", () => {
    const { editor } = setup({ stages: [[A, OR, OPEN, B, CLOSE]] });
    editor.commands.setTextSelection(2);
    type(editor, "(");
    expect(getStages(editor)).toEqual([[A, OR, OPEN, OPEN, B, CLOSE]]);
  });

  it("keeps ( and ) typed in a draft as text", () => {
    const { editor } = setup({ stages: [[A]] });
    editor.commands.setTextSelection(1);
    type(editor, "x(y)");
    expect(findDraft(editor)?.text).toBe("x(y)");
    expect(getStages(editor)).toEqual([[A]]);
  });

  it(") adds a ) when there is none after the caret", () => {
    const { editor } = setup({ stages: [[OPEN, A]] });
    editor.commands.setTextSelection(2);
    type(editor, ")");
    expect(getStages(editor)).toEqual([[OPEN, A, CLOSE]]);
  });

  it(") steps over an existing )", () => {
    const { editor } = setup({ stages: [[OPEN, A, CLOSE]] });
    editor.commands.setTextSelection(2);
    type(editor, ")");
    expect(getStages(editor)).toEqual([[OPEN, A, CLOSE]]);
    expect(editor.state.selection.from).toBe(3);
  });
});
