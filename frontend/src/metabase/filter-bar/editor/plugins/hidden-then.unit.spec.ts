import { Editor } from "@tiptap/core";

import type { Token } from "../../model";
import { editPillAt, pill } from "../../test-utils";
import { tokensToContent } from "../document";
import { draftContent, insertDraft } from "../draft/layout";
import { createEditorExtensions } from "../extensions";

const A = pill("A");
const B = pill("B");

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

const countHidden = (editor: Editor) =>
  editor.view.dom.querySelectorAll("[data-hidden]").length;

const getHiddenCount = (...stages: Token<string>[][]) =>
  countHidden(setup({ stages }).editor);

describe("hidden then", () => {
  it.each([
    { stages: [[], [A]], hidden: 1 },
    { stages: [[], [], [A]], hidden: 2 },
  ])(
    "hides every then with no row filters before it in $stages",
    ({ stages, hidden }) => {
      expect(getHiddenCount(...stages)).toBe(hidden);
    },
  );

  it("shows a then after a row filter", () => {
    expect(getHiddenCount([A], [B])).toBe(0);
  });

  it("hides the then of an empty stage", () => {
    expect(getHiddenCount([A], [], [B])).toBe(1);
  });

  it("hides the then of an empty last stage", () => {
    expect(getHiddenCount([A], [])).toBe(1);
  });

  it("shows a then after a row filter that is being edited", () => {
    const { editor } = setup({ stages: [[A], [B]] });
    editPillAt(editor, 0, A);
    expect(countHidden(editor)).toBe(0);
  });

  it("shows the then of a stage with only a draft in it", () => {
    const { editor } = setup({ stages: [[A], []] });
    insertDraft(editor, { from: 2, to: 2 }, draftContent("co"), 1);
    expect(countHidden(editor)).toBe(0);
  });
});
