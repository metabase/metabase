import { CLOSE, OPEN, OR, pill } from "../../test-utils";
import { createTestEditor } from "../test-editor";

const A = pill("A");
const B = pill("B");

describe("parens", () => {
  it("( adds its ), and an OR leaves the missing connector to blur", () => {
    const { getStages, placeCaret, type } = createTestEditor([A, OR, B]);
    placeCaret(3);
    type("(");
    expect(getStages()).toEqual([[A, OR, B, OPEN, CLOSE]]);
  });

  it("( before a pill adds no )", () => {
    const { getStages, placeCaret, type } = createTestEditor([A, OR, B]);
    placeCaret(2);
    type("(");
    expect(getStages()).toEqual([[A, OR, OPEN, B]]);
  });

  it(") adds a ) when there is none after the caret", () => {
    const { getStages, placeCaret, type } = createTestEditor([OPEN, A]);
    placeCaret(2);
    type(")");
    expect(getStages()).toEqual([[OPEN, A, CLOSE]]);
  });

  it(") steps over an existing )", () => {
    const { editor, getStages, placeCaret, type } = createTestEditor([
      OPEN,
      A,
      CLOSE,
    ]);
    placeCaret(2);
    type(")");
    expect(getStages()).toEqual([[OPEN, A, CLOSE]]);
    expect(editor.state.selection.from).toBe(4);
  });
});
