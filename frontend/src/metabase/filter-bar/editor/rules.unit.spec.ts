import { AND, CLOSE, OPEN, OR, pill } from "../test-utils";

import { createTestEditor } from "./test-editor";

const A = pill("A");
const B = pill("B");
const C = pill("C");

describe("filter bar rules", () => {
  describe("removing", () => {
    it("removes a selected pill and leaves its connector to blur", () => {
      const { getStages, selectNode, press } = createTestEditor([A, OR, B]);
      selectNode(2);
      press("Backspace");
      expect(getStages()).toEqual([[A, OR]]);
    });

    it("removes the pill before the caret", () => {
      const { getStages, placeCaret, press } = createTestEditor([
        A,
        OR,
        B,
        OR,
        C,
      ]);
      placeCaret(3);
      press("Backspace");
      expect(getStages()).toEqual([[A, OR, OR, C]]);
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

    it("removes a connector right away, not selecting it first", () => {
      const { getStages, placeCaret, press } = createTestEditor([
        A,
        OR,
        B,
        OR,
        C,
      ]);
      placeCaret(2);
      press("Backspace");
      expect(getStages()).toEqual([[A, B, OR, C]]);
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
    it("switches the selected connector on Enter", () => {
      const { getStages, selectNode, press } = createTestEditor([
        A,
        OR,
        B,
        OR,
        C,
      ]);
      selectNode(1);
      press("Enter");
      expect(getStages()).toEqual([[A, AND, B, OR, C]]);
    });

    it("turns typed and / or into connectors", () => {
      const { getStages, placeCaret, type } = createTestEditor([A, OR, B, C]);
      placeCaret(3);
      type("or ");
      expect(getStages()).toEqual([[A, OR, B, OR, C]]);
    });

    it("drops a typed connector right after the same one", () => {
      const { editor, getStages, placeCaret, type } = createTestEditor([
        A,
        AND,
        B,
      ]);
      placeCaret(2);
      type("and ");
      expect(getStages()).toEqual([[A, AND, B]]);
      expect(editor.state.selection.from).toBe(3);
      expect(editor.view.dom).not.toHaveTextContent("and");
    });

    it("switches the connector before the caret to the typed one", () => {
      const { editor, getStages, placeCaret, type } = createTestEditor([
        A,
        AND,
        B,
      ]);
      placeCaret(2);
      type("or ");
      expect(getStages()).toEqual([[A, OR, B]]);
      expect(editor.state.selection.from).toBe(3);
    });

    it("keeps a word that only ends with and / or as text", () => {
      const { editor, getStages, placeCaret, type } = createTestEditor([A]);
      placeCaret(1);
      type("brand ");
      expect(getStages()).toEqual([[A]]);
      expect(editor.view.dom).toHaveTextContent("brand");
    });
  });

  describe("parens", () => {
    it("( adds its ), and an OR leaves the missing connector to blur", () => {
      const { getStages, placeCaret, type } = createTestEditor([A, OR, B]);
      placeCaret(3);
      type("(");
      expect(getStages()).toEqual([[A, OR, B, OPEN, CLOSE]]);
    });

    it("( before a pill adds no )", () => {
      const { getStages, placeCaret, type } = createTestEditor([A, OR, B]);
      placeCaret(2);
      type("(");
      expect(getStages()).toEqual([[A, OR, OPEN, B]]);
    });

    it(") adds a ) when there is none after the caret", () => {
      const { getStages, placeCaret, type } = createTestEditor([OPEN, A]);
      placeCaret(2);
      type(")");
      expect(getStages()).toEqual([[OPEN, A, CLOSE]]);
    });

    it(") steps over an existing )", () => {
      const { editor, getStages, placeCaret, type } = createTestEditor([
        OPEN,
        A,
        CLOSE,
      ]);
      placeCaret(2);
      type(")");
      expect(getStages()).toEqual([[OPEN, A, CLOSE]]);
      expect(editor.state.selection.from).toBe(4);
    });
  });
});
