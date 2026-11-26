import { CLOSE, OPEN, OR, pill } from "../../test-utils";
import { createTestEditor } from "../test-editor";

const A = pill("A");
const B = pill("B");

describe("parens", () => {
  it("( after the last pill adds ( and its )", () => {
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

  it("( before a ( adds no )", () => {
    const { getStages, placeCaret, type } = createTestEditor([
      A,
      OR,
      OPEN,
      B,
      CLOSE,
    ]);
    placeCaret(2);
    type("(");
    expect(getStages()).toEqual([[A, OR, OPEN, OPEN, B, CLOSE]]);
  });

  it("keeps ( and ) typed in a draft as text", () => {
    const { findDraft, getStages, placeCaret, type } = createTestEditor([A]);
    placeCaret(1);
    type("x(y)");
    expect(findDraft()?.text).toBe("x(y)");
    expect(getStages()).toEqual([[A]]);
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
