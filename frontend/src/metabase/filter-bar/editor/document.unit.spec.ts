import { pillToken } from "../model";
import { AND, CLOSE, OPEN, OR, createTestPill, pill } from "../test-utils";

import { replacePillTokens } from "./document";
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

  it("ignores typed text", () => {
    const { getStages, placeCaret, type } = createTestEditor([A]);
    placeCaret(1);
    type("xyz");
    expect(getStages()).toEqual([[A]]);
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
});
