import { Editor } from "@tiptap/core";

import { pillToken } from "../model";
import { AND, createTestPill, getStages, pill } from "../test-utils";

import { replacePillTokens, tokensToContent } from "./document";
import { createEditorExtensions } from "./extensions";

const A = pill("A");
const B = pill("B");

const setup = () => {
  const editor = new Editor({
    extensions: createEditorExtensions({ caretClassName: "caret" }),
    content: tokensToContent([[A, AND, B]]),
  });
  const removeFirstPill = () => {
    editor.commands.setNodeSelection(0);
    editor.commands.deleteSelection();
  };
  return { editor, removeFirstPill };
};

describe("undo", () => {
  it("brings back a removed pill with its filter", () => {
    const { editor, removeFirstPill } = setup();
    removeFirstPill();
    editor.commands.undo();
    expect(getStages(editor)[0][0]).toBe(A);
  });

  it("skips the filters the host sent back", () => {
    const { editor, removeFirstPill } = setup();
    removeFirstPill();
    const newB = pillToken("new B", createTestPill("B"));
    replacePillTokens(editor, [[AND, newB]]);
    expect(getStages(editor)[0][1]).toBe(newB);
    editor.commands.undo();
    expect(getStages(editor)[0][0]).toBe(A);
    expect(getStages(editor)[0][2]).toBe(newB);
  });
});
