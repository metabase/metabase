import { OR, pill } from "../test-utils";

import { createTestEditor } from "./test-editor";

const A = pill("A");
const B = pill("B");

describe("filter bar caret", () => {
  it("is drawn at the caret position", () => {
    const { editor, placeCaret } = createTestEditor([A, OR, B]);
    placeCaret(2);
    const paragraph = editor.view.dom.querySelector("p");
    const children = [...(paragraph?.children ?? [])];
    expect(children.findIndex((child) => child.matches(".caret"))).toBe(2);
  });

  it("is drawn at the moving end of a range selection", () => {
    const { editor } = createTestEditor([A, OR, B]);
    editor.commands.setTextSelection({ from: 1, to: 3 });
    const paragraph = editor.view.dom.querySelector("p");
    const children = [...(paragraph?.children ?? [])];
    expect(children.findIndex((child) => child.matches(".caret"))).toBe(2);
  });

  it("is not drawn when a pill is selected", () => {
    const { editor, selectNode } = createTestEditor([A, OR, B]);
    selectNode(0);
    expect(editor.view.dom.querySelector(".caret")).not.toBeInTheDocument();
  });
});
