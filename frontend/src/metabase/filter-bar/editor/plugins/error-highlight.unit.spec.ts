import { DecorationSet } from "@tiptap/pm/view";

import type { Token } from "../../model";
import { AND, CLOSE, OPEN, OR, pill } from "../../test-utils";
import { pillContent } from "../nodes/nodes";
import { createTestEditorWith } from "../test-editor";

import {
  clearErrors,
  hasErrorDecoration,
  highlightErrors,
} from "./error-highlight";

const A = pill("A");
const B = pill("B");

const setup = (...stages: Token<string>[][]) =>
  createTestEditorWith([], ...stages);

type TestEditor = ReturnType<typeof setup>["editor"];

const getDecorations = (editor: TestEditor) =>
  editor.state.plugins.flatMap((plugin) => {
    const decorations = plugin.props.decorations?.call(plugin, editor.state);
    return decorations instanceof DecorationSet ? decorations.find() : [];
  });

const getErrorPositions = (editor: TestEditor) =>
  getDecorations(editor)
    .filter((decoration) => hasErrorDecoration([decoration]))
    .map(({ from }) => from);

describe("error highlight", () => {
  it("clears the highlight", () => {
    const { editor } = setup([A, AND]);
    highlightErrors(editor);
    clearErrors(editor);
    expect(getErrorPositions(editor)).toEqual([]);
  });

  it.each([
    { stages: [[A, AND]], stage: 0, positions: [1] },
    { stages: [[A], [B, OR]], stage: 1, positions: [3] },
    { stages: [[A], [OPEN, CLOSE]], stage: 1, positions: [2, 3] },
  ])("highlights $positions in $stages", ({ stages, stage, positions }) => {
    const { editor } = setup(...stages);
    expect(highlightErrors(editor)).toMatchObject({ stageIndex: stage });
    expect(getErrorPositions(editor)).toEqual(positions);
  });

  it("moves the highlight with the document edits", () => {
    const { editor } = setup([A, AND]);
    highlightErrors(editor);
    editor.commands.insertContentAt(0, pillContent(B));
    expect(getErrorPositions(editor)).toEqual([2]);
  });

  it("tells an error decoration from the others", () => {
    const { editor } = setup([A, AND]);
    expect(getDecorations(editor)).not.toHaveLength(0);
    expect(hasErrorDecoration(getDecorations(editor))).toBe(false);
    highlightErrors(editor);
    expect(hasErrorDecoration(getDecorations(editor))).toBe(true);
  });
});
