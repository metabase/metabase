import { pill } from "../test-utils";

import { placePill } from "./document";
import { createTestEditor } from "./test-editor";

const A = pill("A");
const B = pill("B");
const C = pill("C");

const setup = (...stages: (typeof A)[][]) => {
  const testEditor = createTestEditor(...stages);
  const placeC = (from: number, stage: number) => {
    if (C.type !== "pill") {
      return;
    }
    placePill(testEditor.editor, { from, to: from }, C, stage);
  };
  return { ...testEditor, placeC };
};

describe("placePill", () => {
  it("puts a pill of the caret stage at the caret", () => {
    const { getStages, placeC } = setup([A, B]);
    placeC(2, 0);
    expect(getStages()).toEqual([[A, C, B]]);
  });

  it("puts a pill of a later stage at the end of that stage", () => {
    const { getStages, placeC } = setup([A], [B]);
    placeC(1, 1);
    expect(getStages()).toEqual([[A], [B, C]]);
  });

  it("adds the missing then before a pill of a new stage", () => {
    const { getStages, placeC } = setup([A]);
    placeC(1, 1);
    expect(getStages()).toEqual([[A], [C]]);
  });

  it("puts the caret after the pill", () => {
    const { editor, placeC } = setup([A]);
    placeC(1, 1);
    expect(editor.state.selection.from).toBe(4);
  });
});
