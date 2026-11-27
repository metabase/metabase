import { pill } from "../test-utils";

import { placePill } from "./document";
import { createTestEditor } from "./test-editor";

const A = pill("A");
const B = pill("B");
const C = pill("C");

const setup = (...stages: (typeof A)[][]) => {
  const testEditor = createTestEditor(...stages);
  const placeC = (from: number, stage: number, to = from) =>
    placePill(testEditor.editor, { from, to }, C, stage);
  return { ...testEditor, placeC };
};

describe("placePill", () => {
  it("puts a pill of the caret stage at the caret", () => {
    const { editor, getStages, placeC } = setup([A, B]);
    placeC(1, 0);
    expect(getStages()).toEqual([[A, C, B]]);
    expect(editor.state.selection.from).toBe(2);
  });

  it("replaces the range with the pill", () => {
    const { editor, getStages, placeC } = setup([A, B]);
    placeC(0, 0, 1);
    expect(getStages()).toEqual([[C, B]]);
    expect(editor.state.selection.from).toBe(1);
  });

  it("puts a pill of a later stage at the end of that stage", () => {
    const { getStages, placeC } = setup([A], [B]);
    placeC(0, 1);
    expect(getStages()).toEqual([[A], [B, C]]);
  });

  it("puts a pill of an earlier stage before the next then", () => {
    const { editor, getStages, placeC } = setup([A], [B]);
    placeC(3, 0);
    expect(getStages()).toEqual([[A, C], [B]]);
    expect(editor.state.selection.from).toBe(2);
  });

  it("adds the missing then before a pill of a new stage", () => {
    const { getStages, placeC } = setup([A]);
    placeC(0, 1);
    expect(getStages()).toEqual([[A], [C]]);
  });

  it("adds every missing then before a pill of a far stage", () => {
    const { getStages, placeC } = setup([A]);
    placeC(0, 2);
    expect(getStages()).toEqual([[A], [], [C]]);
  });

  it("puts the caret after the pill", () => {
    const { editor, placeC } = setup([A]);
    placeC(0, 1);
    expect(editor.state.selection.from).toBe(3);
  });
});
