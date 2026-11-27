import { pillToken } from "../model";
import { AND, createTestPill, pill } from "../test-utils";

import { replacePillTokens } from "./document";
import { createTestEditorWith } from "./test-editor";

const A = pill("A");
const B = pill("B");

const setup = () => {
  const testEditor = createTestEditorWith([], [A, AND, B]);
  const removeFirstPill = () => {
    testEditor.selectNode(0);
    testEditor.editor.commands.deleteSelection();
  };
  return { ...testEditor, removeFirstPill };
};

describe("undo", () => {
  it("brings back a removed pill with its filter", () => {
    const { editor, removeFirstPill, getStages } = setup();
    removeFirstPill();
    editor.commands.undo();
    expect(getStages()[0][0]).toBe(A);
  });

  it("skips the filters the host sent back", () => {
    const { editor, removeFirstPill, getStages } = setup();
    removeFirstPill();
    const newB = pillToken("new B", createTestPill("B"));
    replacePillTokens(editor, [[AND, newB]]);
    expect(getStages()[0][1]).toBe(newB);
    editor.commands.undo();
    expect(getStages()[0][0]).toBe(A);
    expect(getStages()[0][2]).toBe(newB);
  });
});
