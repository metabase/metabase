import { OR, pill } from "../../test-utils";
import { createTestEditor } from "../test-editor";

const A = pill("A");
const B = pill("B");

const findCaretIndex = (dom: HTMLElement) =>
  [...dom.children].findIndex((child) => child.matches(".caret"));

describe("caret", () => {
  it("is drawn at the caret position", () => {
    const { editor, placeCaret } = createTestEditor([A, OR, B]);
    placeCaret(2);
    expect(findCaretIndex(editor.view.dom)).toBe(2);
  });

  it("is not drawn when a pill is selected", () => {
    const { editor, selectNode } = createTestEditor([A, OR, B]);
    selectNode(0);
    expect(editor.view.dom.querySelector(".caret")).toBeNull();
  });
});
