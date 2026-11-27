import { pill } from "../../test-utils";
import { draftContent, insertDraft } from "../draft/layout";
import { createTestEditor } from "../test-editor";

const A = pill("A");
const B = pill("B");

const countHidden = (editor: ReturnType<typeof createTestEditor>["editor"]) =>
  editor.view.dom.querySelectorAll("[data-hidden]").length;

const getHiddenCount = (...stages: Parameters<typeof createTestEditor>) =>
  countHidden(createTestEditor(...stages).editor);

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
    const { editor, editPillAt } = createTestEditor([A], [B]);
    editPillAt(0, A);
    expect(countHidden(editor)).toBe(0);
  });

  it("shows the then of a stage with only a draft in it", () => {
    const { editor } = createTestEditor([A], []);
    insertDraft(editor, { from: 2, to: 2 }, draftContent("co"), 1);
    expect(countHidden(editor)).toBe(0);
  });
});
