import { AND, CLOSE, OPEN, OR, pill } from "../test-utils";

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
});
