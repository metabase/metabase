import { pillToken } from "../model";
import { AND, CLOSE, OPEN, OR, createTestPill, pill } from "../test-utils";

import {
  getStageAt,
  normalizeDocument,
  placePillAt,
  replacePillTokens,
} from "./document";
import { createTestEditor } from "./test-editor";

const A = pill("A");
const B = pill("B");
const C = pill("C");

const getNodeNames = (
  editor: ReturnType<typeof createTestEditor>["editor"],
) => {
  const names: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.isInline) {
      names.push(node.type.name);
    }
  });
  return names;
};

describe("document", () => {
  it("keeps the stages on the way through the document", () => {
    const stages = [[A, AND, OPEN, B, OR, C, CLOSE], [pill("D")]];
    expect(createTestEditor(...stages).getStages()).toEqual(stages);
  });

  it("keeps empty stages", () => {
    const stages = [[], [A], [], [B]];
    expect(createTestEditor(...stages).getStages()).toEqual(stages);
  });

  it("parts the stages with a then node", () => {
    const { editor } = createTestEditor([A], [], [B]);
    expect(getNodeNames(editor)).toEqual(["pill", "then", "then", "pill"]);
  });

  it("puts the new pill tokens into the pills in place of the old ones", () => {
    const { editor, getStages } = createTestEditor([A, AND, B]);
    const newA = pillToken("new A", createTestPill("A"));
    const newB = pillToken("new B", createTestPill("B"));
    replacePillTokens(editor, [[newA, AND, newB]]);
    expect(getStages()[0][0]).toBe(newA);
    expect(getStages()[0][2]).toBe(newB);
  });

  it("matches pills by their order when the document hides an and", () => {
    const { editor, getStages } = createTestEditor([A, B, OR, C]);
    const newB = pillToken("new B", createTestPill("B"));
    replacePillTokens(editor, [[A, AND, newB, OR, C]]);
    expect(getStages()).toEqual([[A, newB, OR, C]]);
  });

  it("puts the new token into a draft that edits a pill and back on leave", () => {
    const { editor, getStages, findDraft, editPillAt } = createTestEditor([
      A,
      AND,
      B,
    ]);
    editPillAt(1, A);
    const newA = pillToken("new A", createTestPill("A"));
    replacePillTokens(editor, [[newA, AND, B]]);
    expect(getStages()[0][0]).toBe(newA);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(findDraft()).toBeNull();
    expect(getStages()).toEqual([[newA, AND, B]]);
  });

  it("keeps the old pills that have no new token", () => {
    const { editor, getStages } = createTestEditor([A, AND, B]);
    const newA = pillToken("new A", createTestPill("A"));
    replacePillTokens(editor, [[newA]]);
    expect(getStages()).toEqual([[newA, AND, B]]);
  });

  it("dispatches nothing when every filter is the same", () => {
    const { editor } = createTestEditor([A, AND, B]);
    const { state } = editor;
    replacePillTokens(editor, [[pill("A"), AND, pill("B")]]);
    expect(editor.state).toBe(state);
  });

  describe("normalizeDocument", () => {
    it("keeps a normalized document as it is", () => {
      const { editor } = createTestEditor([A, OR, B]);
      const { state } = editor;
      normalizeDocument(editor);
      expect(editor.state).toBe(state);
    });

    it("removes a dangling bool op", () => {
      const { editor, getStages } = createTestEditor([A, AND]);
      normalizeDocument(editor);
      expect(getStages()).toEqual([[A]]);
    });

    it("removes a draft and keeps the pills", () => {
      const { editor, getStages, findDraft, placeCaret, type } =
        createTestEditor([A]);
      placeCaret(1);
      type("x");
      normalizeDocument(editor);
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[A]]);
    });

    it("puts back a pill that is being edited", () => {
      const { editor, getStages, findDraft, editPillAt } = createTestEditor([
        A,
        OR,
        B,
      ]);
      editPillAt(1, A);
      normalizeDocument(editor);
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[A, OR, B]]);
    });
  });

  it.each([
    { pos: 1, stage: 0 },
    { pos: 2, stage: 0 },
    { pos: 3, stage: 1 },
    { pos: 4, stage: 1 },
  ])("finds stage $stage at $pos", ({ pos, stage }) => {
    const { editor } = createTestEditor([A], [B]);
    expect(getStageAt(editor.state.doc, pos)).toBe(stage);
  });

  it("replaces the pill at the position with the placed one", () => {
    const { editor, getStages } = createTestEditor([A, AND, B]);
    placePillAt(editor, 1, C, 0);
    expect(getStages()).toEqual([[C, AND, B]]);
  });
});
