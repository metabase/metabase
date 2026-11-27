import { Editor } from "@tiptap/core";
import { DecorationSet } from "@tiptap/pm/view";

import type { Token } from "../../model";
import { AND, CLOSE, OPEN, OR, pill } from "../../test-utils";
import { tokensToContent } from "../document";
import { createEditorExtensions } from "../extensions";
import { pillContent } from "../nodes/nodes";

import {
  clearErrors,
  hasErrorDecoration,
  highlightErrors,
} from "./error-highlight";

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

const getDecorations = (editor: Editor) =>
  editor.state.plugins.flatMap((plugin) => {
    const decorations = plugin.props.decorations?.call(plugin, editor.state);
    return decorations instanceof DecorationSet ? decorations.find() : [];
  });

const getErrorPositions = (editor: Editor) =>
  getDecorations(editor)
    .filter((decoration) => hasErrorDecoration([decoration]))
    .map(({ from }) => from);

describe("error highlight", () => {
  it("clears the highlight", () => {
    const { editor } = setup({ stages: [[A, AND]] });
    highlightErrors(editor);
    clearErrors(editor);
    expect(getErrorPositions(editor)).toEqual([]);
  });

  it.each([
    { stages: [[A, AND]], stage: 0, positions: [1] },
    { stages: [[A], [B, OR]], stage: 1, positions: [3] },
    { stages: [[A], [OPEN, CLOSE]], stage: 1, positions: [2, 3] },
  ])("highlights $positions in $stages", ({ stages, stage, positions }) => {
    const { editor } = setup({ stages });
    expect(highlightErrors(editor)).toMatchObject({ stageIndex: stage });
    expect(getErrorPositions(editor)).toEqual(positions);
  });

  it("moves the highlight with the document edits", () => {
    const { editor } = setup({ stages: [[A, AND]] });
    highlightErrors(editor);
    editor.commands.insertContentAt(0, pillContent(B));
    expect(getErrorPositions(editor)).toEqual([2]);
  });

  it("tells an error decoration from the others", () => {
    const { editor } = setup({ stages: [[A, AND]] });
    expect(getDecorations(editor)).not.toHaveLength(0);
    expect(hasErrorDecoration(getDecorations(editor))).toBe(false);
    highlightErrors(editor);
    expect(hasErrorDecoration(getDecorations(editor))).toBe(true);
  });
});
