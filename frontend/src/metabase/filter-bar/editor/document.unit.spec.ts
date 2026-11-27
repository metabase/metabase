import { Editor } from "@tiptap/core";

import { type Token, pillToken } from "../model";
import {
  AND,
  CLOSE,
  OPEN,
  OR,
  createTestPill,
  editPillAt,
  findDraft,
  getStages,
  pill,
  type,
} from "../test-utils";

import {
  getStageAt,
  normalizeDocument,
  placePillAt,
  replacePillTokens,
  tokensToContent,
} from "./document";
import { createEditorExtensions } from "./extensions";

const A = pill("A");
const B = pill("B");
const C = pill("C");

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

const getNodeNames = (editor: Editor) => {
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
    const { editor } = setup({ stages });
    expect(getStages(editor)).toEqual(stages);
  });

  it("keeps empty stages", () => {
    const stages = [[], [A], [], [B]];
    const { editor } = setup({ stages });
    expect(getStages(editor)).toEqual(stages);
  });

  it("parts the stages with a then node", () => {
    const { editor } = setup({ stages: [[A], [], [B]] });
    expect(getNodeNames(editor)).toEqual(["pill", "then", "then", "pill"]);
  });

  it("puts the new pill tokens into the pills in place of the old ones", () => {
    const { editor } = setup({ stages: [[A, AND, B]] });
    const newA = pillToken("new A", createTestPill("A"));
    const newB = pillToken("new B", createTestPill("B"));
    replacePillTokens(editor, [[newA, AND, newB]]);
    expect(getStages(editor)[0][0]).toBe(newA);
    expect(getStages(editor)[0][2]).toBe(newB);
  });

  it("matches pills by their order when the document hides an and", () => {
    const { editor } = setup({ stages: [[A, B, OR, C]] });
    const newB = pillToken("new B", createTestPill("B"));
    replacePillTokens(editor, [[A, AND, newB, OR, C]]);
    expect(getStages(editor)).toEqual([[A, newB, OR, C]]);
  });

  it("puts the new token into a draft that edits a pill and back on leave", () => {
    const { editor } = setup({ stages: [[A, AND, B]] });
    editPillAt(editor, 0, A);
    const newA = pillToken("new A", createTestPill("A"));
    replacePillTokens(editor, [[newA, AND, B]]);
    expect(getStages(editor)[0][0]).toBe(newA);
    editor.commands.setTextSelection(editor.state.doc.content.size);
    expect(findDraft(editor)).toBeNull();
    expect(getStages(editor)).toEqual([[newA, AND, B]]);
  });

  it("keeps the old pills that have no new token", () => {
    const { editor } = setup({ stages: [[A, AND, B]] });
    const newA = pillToken("new A", createTestPill("A"));
    replacePillTokens(editor, [[newA]]);
    expect(getStages(editor)).toEqual([[newA, AND, B]]);
  });

  it("dispatches nothing when every filter is the same", () => {
    const { editor } = setup({ stages: [[A, AND, B]] });
    const { state } = editor;
    replacePillTokens(editor, [[pill("A"), AND, pill("B")]]);
    expect(editor.state).toBe(state);
  });

  describe("normalizeDocument", () => {
    it("keeps a normalized document as it is", () => {
      const { editor } = setup({ stages: [[A, OR, B]] });
      const { state } = editor;
      normalizeDocument(editor);
      expect(editor.state).toBe(state);
    });

    it("removes a dangling bool op", () => {
      const { editor } = setup({ stages: [[A, AND]] });
      normalizeDocument(editor);
      expect(getStages(editor)).toEqual([[A]]);
    });

    it("removes a draft and keeps the pills", () => {
      const { editor } = setup({ stages: [[A]] });
      editor.commands.setTextSelection(1);
      type(editor, "x");
      normalizeDocument(editor);
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[A]]);
    });

    it("puts back a pill that is being edited", () => {
      const { editor } = setup({ stages: [[A, OR, B]] });
      editPillAt(editor, 0, A);
      normalizeDocument(editor);
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[A, OR, B]]);
    });
  });

  it.each([
    { pos: 0, stage: 0 },
    { pos: 1, stage: 0 },
    { pos: 2, stage: 1 },
    { pos: 3, stage: 1 },
  ])("finds stage $stage at $pos", ({ pos, stage }) => {
    const { editor } = setup({ stages: [[A], [B]] });
    expect(getStageAt(editor.state.doc, pos)).toBe(stage);
  });

  it("replaces the pill at the position with the placed one", () => {
    const { editor } = setup({ stages: [[A, AND, B]] });
    placePillAt(editor, 0, C, 0);
    expect(getStages(editor)).toEqual([[C, AND, B]]);
  });
});
