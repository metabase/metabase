import type { Token } from "../../model";
import { AND, OR, pill } from "../../test-utils";
import type { FilterColumn, FilterOperator } from "../../types";
import { createTestEditor, createTestEditorWith } from "../test-editor";

import {
  columnDraftContent,
  editClickedPart,
  insertDraft,
  insertPillDraft,
  placeDraftInput,
} from "./layout";
import { createDraftPlaceholders } from "./plugins/placeholders";
import { findPartStep, getInputs, readDraft, readValues } from "./read";
import type { ColumnPart, OperatorPart } from "./types";

const A = pill("A");
const B = pill("B");

const COLUMN: FilterColumn = { key: "c", label: "C", icon: "int" };
const LIST: FilterOperator = { key: "=", label: "is", valueKind: "multi" };
const BETWEEN: FilterOperator = {
  key: "between",
  label: "is between",
  valueKind: "range",
};
const COLUMN_PART: ColumnPart = {
  type: "column",
  column: COLUMN,
  targetStage: 0,
};
const toOperatorPart = (operator: FilterOperator): OperatorPart => ({
  type: "operator",
  operator,
});

const createWithDraft = (
  tokens: Token<string>[],
  gap: number,
  text: string,
) => {
  const testEditor = createTestEditor(tokens);
  testEditor.placeCaret(gap);
  testEditor.type(text);
  return testEditor;
};

const setupPillDraft = (
  operator: FilterOperator,
  values: unknown[],
  extensions: Parameters<typeof createTestEditorWith>[0] = [],
) => {
  const testEditor = createTestEditorWith(extensions, [A]);
  const { editor, getCaretDraft } = testEditor;
  const operatorPart = toOperatorPart(operator);
  insertPillDraft(
    editor,
    { from: 2, to: 2 },
    pill("C"),
    { column: COLUMN_PART, operator: operatorPart, values },
    "value",
  );
  const read = () => {
    const draft = getCaretDraft();
    return { ...readDraft(draft), values: readValues(draft) };
  };
  const inputs = () => getInputs(getCaretDraft());
  return { ...testEditor, operatorPart, read, inputs };
};

describe("draft", () => {
  describe("typing at the caret", () => {
    it("creates a draft with the typed text, the caret in it", () => {
      const { editor, getStages, findDraft } = createWithDraft(
        [A, AND, B],
        2,
        "st",
      );
      expect(findDraft()).toEqual({ pos: 3, text: "st" });
      expect(editor.state.selection.from).toBe(7);
      expect(getStages()).toEqual([[A, AND, B]]);
    });

    it("creates nothing for a space", () => {
      const { findDraft } = createWithDraft([A], 1, " ");
      expect(findDraft()).toBeNull();
    });

    it("creates no draft for (", () => {
      const { findDraft } = createWithDraft([A], 1, "(");
      expect(findDraft()).toBeNull();
    });
  });

  describe("text that becomes a bool op", () => {
    it.each([
      { text: "or ", boolOp: OR },
      { text: "OR ", boolOp: OR },
      { text: "And ", boolOp: AND },
    ])("turns $text into a bool op", ({ text, boolOp }) => {
      const { editor, getStages, findDraft } = createWithDraft([A], 1, text);
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[A, boolOp]]);
      expect(editor.state.selection.from).toBe(3);
    });

    it.each([
      { text: "or ", boolOp: OR },
      { text: "and ", boolOp: AND },
    ])("puts $text in place of the bool op before it", ({ text, boolOp }) => {
      const { editor, getStages, findDraft } = createWithDraft(
        [A, AND, B],
        2,
        text,
      );
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[A, boolOp, B]]);
      expect(editor.state.selection.from).toBe(3);
    });

    it("keeps other text, even a word that ends with and / or", () => {
      const { findDraft } = createWithDraft([A], 1, "brand ");
      expect(findDraft()?.text).toBe("brand ");
    });
  });

  describe("moving the caret", () => {
    it("moves the caret to the start of the draft on Home", () => {
      const { editor, findDraft, press } = createWithDraft([A], 1, "st");
      press("Home");
      expect(findDraft()?.text).toBe("st");
      expect(editor.state.selection.from).toBe(4);
    });

    it("moves the caret to the end of the draft on End", () => {
      const { editor, findDraft, press } = createWithDraft([A], 1, "st");
      editor.commands.setTextSelection(4);
      press("End");
      expect(findDraft()?.text).toBe("st");
      expect(editor.state.selection.from).toBe(6);
    });
  });

  describe("leaving", () => {
    it("removes the draft when the caret leaves it", () => {
      const { editor, findDraft } = createWithDraft([A, AND, B], 2, "x");
      editor.commands.setTextSelection(1);
      expect(findDraft()).toBeNull();
    });

    it("selects the token before on ← at its start", () => {
      const { editor, findDraft, press } = createWithDraft([A, AND, B], 2, "x");
      editor.commands.setTextSelection(5);
      press("ArrowLeft");
      expect(findDraft()).toBeNull();
      expect(editor.state.selection).toMatchObject({ from: 2, to: 3 });
    });

    it("selects the token after on → at its end", () => {
      const { editor, findDraft, press } = createWithDraft([A, AND, B], 2, "x");
      press("ArrowRight");
      expect(findDraft()).toBeNull();
      expect(editor.state.selection).toMatchObject({ from: 3, to: 4 });
    });

    it("removes the draft on Escape", () => {
      const { findDraft, getStages, press } = createWithDraft([A], 1, "x");
      press("Escape");
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[A]]);
    });

    it("removes the draft once its text is gone", () => {
      const { editor, findDraft } = createWithDraft([A], 1, "x");
      editor.commands.deleteRange({ from: 4, to: 5 });
      expect(findDraft()).toBeNull();
    });
  });

  describe("findPartStep", () => {
    it("matches an empty query at a bare caret", () => {
      const { editor, placeCaret } = createTestEditor([A, AND, B]);
      placeCaret(2);
      expect(findPartStep(editor.state.selection.$from)).toEqual({
        range: { from: 3, to: 3 },
        query: "",
        text: "",
      });
    });

    it("matches the whole draft with its text as the query", () => {
      const { editor } = createWithDraft([A], 1, "st");
      expect(findPartStep(editor.state.selection.$from)).toMatchObject({
        range: { from: 2, to: 8 },
        query: "st",
      });
    });

    it("matches the operator step once the draft has a column", () => {
      const { editor, type } = createTestEditor([A]);
      insertDraft(editor, { from: 2, to: 2 }, columnDraftContent(COLUMN_PART));
      type("is");
      expect(findPartStep(editor.state.selection.$from)).toMatchObject({
        range: { from: 2, to: 9 },
        query: "is",
      });
    });

    it("does not match once the draft has an operator", () => {
      const { editor, getCaretDraft } = createTestEditor([A]);
      insertDraft(editor, { from: 2, to: 2 }, columnDraftContent(COLUMN_PART));
      placeDraftInput(
        editor,
        getCaretDraft(),
        { column: COLUMN_PART, operator: toOperatorPart(LIST), values: [] },
        "value",
      );
      expect(findPartStep(editor.state.selection.$from)).toBeNull();
    });

    it("matches the draft up to the input of the edited part", () => {
      const { editor, press } = setupPillDraft(LIST, ["a"]);
      press("ArrowLeft");
      expect(findPartStep(editor.state.selection.$from)).toEqual({
        range: { from: 2, to: 6 },
        query: "",
        text: "",
      });
    });
  });

  describe("column part", () => {
    it("replaces the draft text with the column, the caret after it", () => {
      const { editor, findDraft } = createWithDraft([A], 1, "st");
      insertDraft(editor, { from: 2, to: 8 }, columnDraftContent(COLUMN_PART));
      expect(findDraft()).toEqual({ pos: 2, text: "" });
      expect(editor.state.selection.from).toBe(5);
    });

    it("keeps and / or as text after the column", () => {
      const { editor, type, findDraft } = createTestEditor([A]);
      insertDraft(editor, { from: 2, to: 2 }, columnDraftContent(COLUMN_PART));
      type("or ");
      expect(findDraft()?.text).toBe("or ");
    });

    it("removes the column on Backspace right after it", () => {
      const { editor, press, findDraft } = createTestEditor([A]);
      insertDraft(editor, { from: 2, to: 2 }, columnDraftContent(COLUMN_PART));
      press("Backspace");
      expect(findDraft()).toBeNull();
    });
  });

  describe("moving between parts", () => {
    const setup = setupPillDraft;

    it("edits the operator, then the column, on ArrowLeft", () => {
      const { press, read, operatorPart } = setup(LIST, ["a", "b"]);
      press("ArrowLeft");
      expect(read()).toMatchObject({
        step: "operator",
        edited: operatorPart,
        column: COLUMN_PART,
        values: ["a", "b"],
      });
      press("ArrowLeft");
      expect(read()).toMatchObject({ step: "column", edited: COLUMN_PART });
    });

    it("goes back to the values on ArrowRight", () => {
      const { press, read } = setup(LIST, ["a", "b"]);
      press("ArrowLeft");
      press("ArrowLeft");
      press("ArrowRight");
      expect(read()).toMatchObject({ step: "operator" });
      press("ArrowRight");
      expect(read()).toMatchObject({
        step: "value",
        edited: null,
        values: ["a", "b"],
      });
    });

    it("removes the edited operator and its values on Backspace", () => {
      const { press, read } = setup(LIST, ["a", "b"]);
      press("ArrowLeft");
      press("Backspace");
      expect(read()).toMatchObject({
        step: "operator",
        edited: null,
        column: COLUMN_PART,
        operator: null,
        values: [],
      });
    });

    it("edits a part on click", () => {
      const { editor, read, getCaretDraft } = setup(LIST, ["a"]);
      const draft = getCaretDraft();
      editClickedPart(editor, draft.node.child(0), draft.pos + 1);
      expect(read()).toMatchObject({ step: "column", edited: COLUMN_PART });
    });

    it("puts the edited part back on Escape", () => {
      const { press, read, operatorPart } = setup(LIST, ["a", "b"]);
      press("ArrowLeft");
      press("Escape");
      expect(read()).toMatchObject({
        step: "value",
        edited: null,
        operator: operatorPart,
        values: ["a", "b"],
      });
    });

    it("edits a single value in place", () => {
      const { read } = setup(
        { key: ">", label: "greater than", valueKind: "single" },
        ["10"],
      );
      expect(read()).toMatchObject({
        step: "value",
        valuesPart: null,
        texts: ["10"],
        values: ["10"],
      });
    });

    it("edits both ends of a range in place", () => {
      const { read } = setup(BETWEEN, ["20", "100"]);
      expect(read()).toMatchObject({
        step: "value",
        texts: ["20", "100"],
        values: ["20", "100"],
      });
    });

    it("keeps an empty start of a range in its place", () => {
      const { editor, read, inputs } = setup(BETWEEN, ["", "100"]);
      expect(read()).toMatchObject({ texts: ["", "100"], values: ["", "100"] });
      expect(editor.state.selection.from).toBe(inputs()[0].from);
    });

    it("moves between the ends of a range with the arrows", () => {
      const { editor, press, inputs } = setup(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[1].from);
      press("ArrowLeft");
      expect(editor.state.selection.from).toBe(inputs()[0].to);
      press("ArrowRight");
      expect(editor.state.selection.from).toBe(inputs()[1].from);
    });

    it("keeps the range values when it edits the operator", () => {
      const { editor, press, read, inputs } = setup(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[0].from);
      press("ArrowLeft");
      expect(read()).toMatchObject({
        step: "operator",
        values: ["20", "100"],
      });
      press("Escape");
      expect(read()).toMatchObject({ step: "value", texts: ["20", "100"] });
    });

    it("goes from the start of a range to its end on Tab", () => {
      const { editor, press, inputs } = setup(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[0].from);
      press("Tab");
      expect(editor.state.selection.from).toBe(inputs()[1].to);
    });

    it("edits the part before on Shift+Tab", () => {
      const { press, read } = setup(BETWEEN, ["20", "100"]);
      press("Tab", { shiftKey: true });
      press("Tab", { shiftKey: true });
      expect(read()).toMatchObject({
        step: "operator",
        values: ["20", "100"],
      });
    });

    it("goes back to the values on Tab from the operator", () => {
      const { press, read } = setup(LIST, ["a"]);
      press("ArrowLeft");
      press("Tab");
      expect(read()).toMatchObject({ step: "value", values: ["a"] });
    });

    it("goes to the first end on Backspace at the start of the second", () => {
      const { editor, press, read, inputs } = setup(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[1].from);
      press("Backspace");
      expect(editor.state.selection.from).toBe(inputs()[0].to);
      expect(read()).toMatchObject({ texts: ["20", "100"] });
    });

    it("keeps the and of a range on Delete at the end of its start", () => {
      const { editor, press, read, inputs } = setup(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[0].to);
      expect(press("Delete")).toBe(true);
      expect(read()).toMatchObject({ texts: ["20", "100"] });
    });

    it("leaves Tab at the last input with no next part to others", () => {
      const { editor, press, inputs } = setup(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[1].to);
      expect(press("Tab")).toBe(false);
    });

    it("adds no value node to a list with no values", () => {
      const { read } = setup(LIST, []);
      expect(read()).toMatchObject({ step: "value", valuesPart: null });
    });
  });

  describe("placeholders", () => {
    const getPlaceholders = (
      editor: ReturnType<typeof setupPillDraft>["editor"],
    ) =>
      [...editor.view.dom.querySelectorAll("[data-placeholder]")].map(
        (element) => element.getAttribute("data-placeholder"),
      );

    it.each([
      { name: "the edited column", keys: 2, expected: ["C"] },
      { name: "the edited operator", keys: 1, expected: ["is"] },
    ])("shows the label of $name", ({ keys, expected }) => {
      const { editor, press } = setupPillDraft(
        LIST,
        ["a"],
        [createDraftPlaceholders()],
      );
      Array.from({ length: keys }).forEach(() => press("ArrowLeft"));
      expect(getPlaceholders(editor)).toEqual(expected);
    });

    it.each([
      { operator: BETWEEN, values: [], expected: ["Min", "Max"] },
      { operator: LIST, values: [], expected: ["Value"] },
      { operator: LIST, values: ["a"], expected: ["Add more"] },
    ])(
      "shows $expected for $operator.key with $values",
      ({ operator, values, expected }) => {
        const { editor } = setupPillDraft(operator, values, [
          createDraftPlaceholders(),
        ]);
        expect(getPlaceholders(editor)).toEqual(expected);
      },
    );
  });

  describe("editing a pill", () => {
    const editA = () => {
      const testEditor = createTestEditor([A, AND, B]);
      insertPillDraft(
        testEditor.editor,
        { from: 1, to: 2 },
        A,
        { column: COLUMN_PART, operator: toOperatorPart(LIST), values: [] },
        "value",
      );
      return testEditor;
    };

    it("keeps the pill in the stages while it is edited", () => {
      const { getStages } = editA();
      expect(getStages()).toEqual([[A, AND, B]]);
    });

    it("puts the pill back when the caret leaves", () => {
      const { editor, getStages, findDraft } = editA();
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[A, AND, B]]);
    });

    it("removes the pill when its draft is erased", () => {
      const { getStages, findDraft, press } = editA();
      press("Backspace");
      press("Backspace");
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[AND, B]]);
    });

    it("puts the pill back on Escape", () => {
      const { getStages, findDraft, press } = editA();
      press("Escape");
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[A, AND, B]]);
    });
  });
});
