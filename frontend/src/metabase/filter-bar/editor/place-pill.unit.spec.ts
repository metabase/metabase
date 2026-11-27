import { Editor } from "@tiptap/core";

import type { Token } from "../model";
import { getStages, pill } from "../test-utils";

import { placePill, tokensToContent } from "./document";
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
  const placeC = (from: number, stage: number, to = from) =>
    placePill(editor, { from, to }, C, stage);
  return { editor, placeC };
};

describe("placePill", () => {
  it("puts a pill of the caret stage at the caret", () => {
    const { editor, placeC } = setup({ stages: [[A, B]] });
    placeC(1, 0);
    expect(getStages(editor)).toEqual([[A, C, B]]);
    expect(editor.state.selection.from).toBe(2);
  });

  it("replaces the range with the pill", () => {
    const { editor, placeC } = setup({ stages: [[A, B]] });
    placeC(0, 0, 1);
    expect(getStages(editor)).toEqual([[C, B]]);
    expect(editor.state.selection.from).toBe(1);
  });

  it("puts a pill of a later stage at the end of that stage", () => {
    const { editor, placeC } = setup({ stages: [[A], [B]] });
    placeC(0, 1);
    expect(getStages(editor)).toEqual([[A], [B, C]]);
  });

  it("puts a pill of an earlier stage before the next then", () => {
    const { editor, placeC } = setup({ stages: [[A], [B]] });
    placeC(3, 0);
    expect(getStages(editor)).toEqual([[A, C], [B]]);
    expect(editor.state.selection.from).toBe(2);
  });

  it("adds the missing then before a pill of a new stage", () => {
    const { editor, placeC } = setup({ stages: [[A]] });
    placeC(0, 1);
    expect(getStages(editor)).toEqual([[A], [C]]);
  });

  it("adds every missing then before a pill of a far stage", () => {
    const { editor, placeC } = setup({ stages: [[A]] });
    placeC(0, 2);
    expect(getStages(editor)).toEqual([[A], [], [C]]);
  });

  it("puts the caret after the pill", () => {
    const { editor, placeC } = setup({ stages: [[A]] });
    placeC(0, 1);
    expect(editor.state.selection.from).toBe(3);
  });
});
