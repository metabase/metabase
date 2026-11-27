import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import type { Token } from "../../model";
import {
  AND,
  CLOSE,
  OPEN,
  OR,
  findDraft,
  getStages,
  pill,
  press,
  type,
} from "../../test-utils";
import { tokensToContent } from "../document";
import { createEditorExtensions } from "../extensions";

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

describe("filter bar keys", () => {
  describe("removing", () => {
    it("leaves a selected pill to the default Backspace", () => {
      const { editor } = setup({ stages: [[A, OR, B]] });
      editor.commands.setNodeSelection(2);
      press(editor, "Backspace");
      expect(getStages(editor)).toEqual([[A, OR]]);
    });

    it.each([
      { name: "a pill", gap: 3, expected: [[A, OR, OR, C]] },
      { name: "a bool op", gap: 2, expected: [[A, B, OR, C]] },
    ])("removes $name before the caret right away", ({ gap, expected }) => {
      const { editor } = setup({ stages: [[A, OR, B, OR, C]] });
      editor.commands.setTextSelection(gap);
      press(editor, "Backspace");
      expect(getStages(editor)).toEqual(expected);
    });

    it("removes the pill after the caret on Delete", () => {
      const { editor } = setup({ stages: [[A, OR, B]] });
      editor.commands.setTextSelection(0);
      press(editor, "Delete");
      expect(getStages(editor)).toEqual([[OR, B]]);
    });

    it("moves the caret before then instead of removing it", () => {
      const { editor } = setup({ stages: [[A], [B]] });
      editor.commands.setTextSelection(2);
      press(editor, "Backspace");
      expect(getStages(editor)).toEqual([[A], [B]]);
      expect(editor.state.selection.from).toBe(1);
    });

    it("moves the caret after then instead of removing it on Delete", () => {
      const { editor } = setup({ stages: [[A], [B]] });
      editor.commands.setTextSelection(1);
      press(editor, "Delete");
      expect(getStages(editor)).toEqual([[A], [B]]);
      expect(editor.state.selection.from).toBe(2);
    });

    it("removes a paren without its pair", () => {
      const { editor } = setup({ stages: [[OPEN, A, OR, B, CLOSE]] });
      editor.commands.setTextSelection(5);
      press(editor, "Backspace");
      expect(getStages(editor)).toEqual([[OPEN, A, OR, B]]);
    });

    it("removes both parens when nothing is between them", () => {
      const { editor } = setup({ stages: [[A, OPEN, CLOSE]] });
      editor.commands.setTextSelection(2);
      press(editor, "Backspace");
      expect(getStages(editor)).toEqual([[A]]);
    });

    it("removes both parens on Delete when nothing is between them", () => {
      const { editor } = setup({ stages: [[A, OPEN, CLOSE]] });
      editor.commands.setTextSelection(2);
      press(editor, "Delete");
      expect(getStages(editor)).toEqual([[A]]);
    });

    it("leaves text before the caret to the default Backspace", () => {
      const { editor } = setup({ stages: [[A]] });
      editor.commands.setTextSelection(1);
      type(editor, "st");
      expect(press(editor, "Backspace")).toBe(false);
      expect(findDraft(editor)?.text).toBe("st");
    });
  });

  describe("moving the caret", () => {
    it("moves the caret to the start on Home", () => {
      const { editor } = setup({ stages: [[A, OR, B]] });
      editor.commands.setTextSelection(2);
      press(editor, "Home");
      expect(editor.state.selection.from).toBe(0);
    });

    it("moves the caret to the end on End", () => {
      const { editor } = setup({ stages: [[A, OR, B]] });
      editor.commands.setTextSelection(1);
      press(editor, "End");
      expect(editor.state.selection.from).toBe(3);
    });
  });

  describe("bool ops", () => {
    it.each([
      { from: OR, to: AND },
      { from: AND, to: OR },
    ])(
      "switches the selected $from.type to $to.type on Enter",
      ({ from, to }) => {
        const { editor } = setup({ stages: [[A, from, B, OR, C]] });
        editor.commands.setNodeSelection(1);
        press(editor, "Enter");
        expect(getStages(editor)).toEqual([[A, to, B, OR, C]]);
        expect(editor.state.selection).toBeInstanceOf(NodeSelection);
        expect(editor.state.selection).toMatchObject({ from: 1, to: 2 });
      },
    );

    it("keeps a selected pill on Enter", () => {
      const { editor } = setup({ stages: [[A, OR, B]] });
      editor.commands.setNodeSelection(0);
      press(editor, "Enter");
      expect(getStages(editor)).toEqual([[A, OR, B]]);
    });

    it("adds no new line on Enter at the caret", () => {
      const { editor } = setup({ stages: [[A, OR, B]] });
      editor.commands.setTextSelection(1);
      expect(press(editor, "Enter")).toBe(true);
      expect(editor.state.doc.childCount).toBe(3);
      expect(getStages(editor)).toEqual([[A, OR, B]]);
    });
  });
});
