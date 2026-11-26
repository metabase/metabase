import { NodeSelection } from "@tiptap/pm/state";

import { AND, CLOSE, OPEN, OR, pill } from "../../test-utils";
import { createTestEditor } from "../test-editor";

const A = pill("A");
const B = pill("B");
const C = pill("C");

describe("filter bar keys", () => {
  describe("removing", () => {
    it("leaves a selected pill to the default Backspace", () => {
      const { getStages, selectNode, press } = createTestEditor([A, OR, B]);
      selectNode(2);
      press("Backspace");
      expect(getStages()).toEqual([[A, OR]]);
    });

    it.each([
      { name: "a pill", gap: 3, expected: [[A, OR, OR, C]] },
      { name: "a connector", gap: 2, expected: [[A, B, OR, C]] },
    ])("removes $name before the caret right away", ({ gap, expected }) => {
      const { getStages, placeCaret, press } = createTestEditor([
        A,
        OR,
        B,
        OR,
        C,
      ]);
      placeCaret(gap);
      press("Backspace");
      expect(getStages()).toEqual(expected);
    });

    it("removes the pill after the caret on Delete", () => {
      const { getStages, placeCaret, press } = createTestEditor([A, OR, B]);
      placeCaret(0);
      press("Delete");
      expect(getStages()).toEqual([[OR, B]]);
    });

    it("moves the caret before then instead of removing it", () => {
      const { editor, getStages, placeCaret, press } = createTestEditor(
        [A],
        [B],
      );
      placeCaret(2);
      press("Backspace");
      expect(getStages()).toEqual([[A], [B]]);
      expect(editor.state.selection.from).toBe(2);
    });

    it("moves the caret after then instead of removing it on Delete", () => {
      const { editor, getStages, placeCaret, press } = createTestEditor(
        [A],
        [B],
      );
      placeCaret(1);
      press("Delete");
      expect(getStages()).toEqual([[A], [B]]);
      expect(editor.state.selection.from).toBe(3);
    });

    it("removes a paren without its pair", () => {
      const { getStages, placeCaret, press } = createTestEditor([
        OPEN,
        A,
        OR,
        B,
        CLOSE,
      ]);
      placeCaret(5);
      press("Backspace");
      expect(getStages()).toEqual([[OPEN, A, OR, B]]);
    });

    it("removes both parens when nothing is between them", () => {
      const { getStages, placeCaret, press } = createTestEditor([
        A,
        OPEN,
        CLOSE,
      ]);
      placeCaret(2);
      press("Backspace");
      expect(getStages()).toEqual([[A]]);
    });

    it("removes both parens on Delete when nothing is between them", () => {
      const { getStages, placeCaret, press } = createTestEditor([
        A,
        OPEN,
        CLOSE,
      ]);
      placeCaret(2);
      press("Delete");
      expect(getStages()).toEqual([[A]]);
    });

    it("leaves text before the caret to the default Backspace", () => {
      const { findDraft, placeCaret, press, type } = createTestEditor([A]);
      placeCaret(1);
      type("st");
      expect(press("Backspace")).toBe(false);
      expect(findDraft()?.text).toBe("st");
    });
  });

  describe("moving the caret", () => {
    it("moves the caret to the start on Home", () => {
      const { editor, placeCaret, press } = createTestEditor([A, OR, B]);
      placeCaret(2);
      press("Home");
      expect(editor.state.selection.from).toBe(1);
    });

    it("moves the caret to the end on End", () => {
      const { editor, placeCaret, press } = createTestEditor([A, OR, B]);
      placeCaret(1);
      press("End");
      expect(editor.state.selection.from).toBe(4);
    });
  });

  describe("connectors", () => {
    it.each([
      { from: OR, to: AND },
      { from: AND, to: OR },
    ])(
      "switches the selected $from.type to $to.type on Enter",
      ({ from, to }) => {
        const { editor, getStages, selectNode, press } = createTestEditor([
          A,
          from,
          B,
          OR,
          C,
        ]);
        selectNode(1);
        press("Enter");
        expect(getStages()).toEqual([[A, to, B, OR, C]]);
        expect(editor.state.selection).toBeInstanceOf(NodeSelection);
        expect(editor.state.selection).toMatchObject({ from: 2, to: 3 });
      },
    );

    it("keeps a selected pill on Enter", () => {
      const { getStages, selectNode, press } = createTestEditor([A, OR, B]);
      selectNode(0);
      press("Enter");
      expect(getStages()).toEqual([[A, OR, B]]);
    });

    it("adds no new line on Enter at the caret", () => {
      const { editor, getStages, press } = createTestEditor([A, OR, B]);
      editor.commands.setTextSelection(2);
      expect(press("Enter")).toBe(true);
      expect(editor.state.doc.childCount).toBe(1);
      expect(getStages()).toEqual([[A, OR, B]]);
    });
  });
});
