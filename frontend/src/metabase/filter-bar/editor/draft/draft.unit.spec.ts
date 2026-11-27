import { type AnyExtension, Editor } from "@tiptap/core";

import type { Token } from "../../model";
import {
  AND,
  OR,
  findDraft,
  getCaretDraft,
  getStages,
  pill,
  press,
  type,
} from "../../test-utils";
import type { FilterColumn, FilterOperator } from "../../types";
import { tokensToContent } from "../document";
import { createEditorExtensions } from "../extensions";

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

type SetupOpts = {
  stages: Token<string>[][];
  extensions?: AnyExtension[];
};

const setup = ({ stages, extensions = [] }: SetupOpts) => {
  const editor = new Editor({
    extensions: [
      ...createEditorExtensions({ caretClassName: "caret" }),
      ...extensions,
    ],
    content: tokensToContent(stages),
  });
  return { editor };
};

const createWithDraft = (
  tokens: Token<string>[],
  gap: number,
  text: string,
) => {
  const { editor } = setup({ stages: [tokens] });
  editor.commands.setTextSelection(gap);
  type(editor, text);
  return { editor };
};

const setupPillDraft = (
  operator: FilterOperator,
  values: unknown[],
  extensions: AnyExtension[] = [],
) => {
  const { editor } = setup({ stages: [[A]], extensions });
  const operatorPart = toOperatorPart(operator);
  insertPillDraft(
    editor,
    { from: 1, to: 1 },
    pill("C"),
    { column: COLUMN_PART, operator: operatorPart, values },
    "value",
  );
  const read = () => {
    const draft = getCaretDraft(editor);
    return { ...readDraft(draft), values: readValues(draft) };
  };
  const inputs = () => getInputs(getCaretDraft(editor));
  return { editor, operatorPart, read, inputs };
};

describe("draft", () => {
  describe("typing at the caret", () => {
    it("creates a draft with the typed text, the caret in it", () => {
      const { editor } = createWithDraft([A, AND, B], 2, "st");
      expect(findDraft(editor)).toEqual({ pos: 2, text: "st" });
      expect(editor.state.selection.from).toBe(6);
      expect(getStages(editor)).toEqual([[A, AND, B]]);
    });

    it("creates nothing for a space", () => {
      const { editor } = createWithDraft([A], 1, " ");
      expect(findDraft(editor)).toBeNull();
    });

    it("creates no draft for (", () => {
      const { editor } = createWithDraft([A], 1, "(");
      expect(findDraft(editor)).toBeNull();
    });
  });

  describe("text that becomes a bool op", () => {
    it.each([
      { text: "or ", boolOp: OR },
      { text: "OR ", boolOp: OR },
      { text: "And ", boolOp: AND },
    ])("turns $text into a bool op", ({ text, boolOp }) => {
      const { editor } = createWithDraft([A], 1, text);
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[A, boolOp]]);
      expect(editor.state.selection.from).toBe(2);
    });

    it.each([
      { text: "or ", boolOp: OR },
      { text: "and ", boolOp: AND },
    ])("puts $text in place of the bool op before it", ({ text, boolOp }) => {
      const { editor } = createWithDraft([A, AND, B], 2, text);
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[A, boolOp, B]]);
      expect(editor.state.selection.from).toBe(2);
    });

    it("keeps other text, even a word that ends with and / or", () => {
      const { editor } = createWithDraft([A], 1, "brand ");
      expect(findDraft(editor)?.text).toBe("brand ");
    });
  });

  describe("moving the caret", () => {
    it("moves the caret to the start of the draft on Home", () => {
      const { editor } = createWithDraft([A], 1, "st");
      press(editor, "Home");
      expect(findDraft(editor)?.text).toBe("st");
      expect(editor.state.selection.from).toBe(3);
    });

    it("moves the caret to the end of the draft on End", () => {
      const { editor } = createWithDraft([A], 1, "st");
      editor.commands.setTextSelection(3);
      press(editor, "End");
      expect(findDraft(editor)?.text).toBe("st");
      expect(editor.state.selection.from).toBe(5);
    });
  });

  describe("leaving", () => {
    it("removes the draft when the caret leaves it", () => {
      const { editor } = createWithDraft([A, AND, B], 2, "x");
      editor.commands.setTextSelection(0);
      expect(findDraft(editor)).toBeNull();
    });

    it("selects the token before on ← at its start", () => {
      const { editor } = createWithDraft([A, AND, B], 2, "x");
      editor.commands.setTextSelection(4);
      press(editor, "ArrowLeft");
      expect(findDraft(editor)).toBeNull();
      expect(editor.state.selection).toMatchObject({ from: 1, to: 2 });
    });

    it("selects the token after on → at its end", () => {
      const { editor } = createWithDraft([A, AND, B], 2, "x");
      press(editor, "ArrowRight");
      expect(findDraft(editor)).toBeNull();
      expect(editor.state.selection).toMatchObject({ from: 2, to: 3 });
    });

    it("removes the draft on Escape", () => {
      const { editor } = createWithDraft([A], 1, "x");
      press(editor, "Escape");
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[A]]);
    });

    it("removes the draft once its text is gone", () => {
      const { editor } = createWithDraft([A], 1, "x");
      editor.commands.deleteRange({ from: 3, to: 4 });
      expect(findDraft(editor)).toBeNull();
    });
  });

  describe("findPartStep", () => {
    it("matches an empty query at a bare caret", () => {
      const { editor } = setup({ stages: [[A, AND, B]] });
      editor.commands.setTextSelection(2);
      expect(findPartStep(editor.state.selection.$from)).toEqual({
        range: { from: 2, to: 2 },
        query: "",
        text: "",
      });
    });

    it("matches the whole draft with its text as the query", () => {
      const { editor } = createWithDraft([A], 1, "st");
      expect(findPartStep(editor.state.selection.$from)).toMatchObject({
        range: { from: 1, to: 7 },
        query: "st",
      });
    });

    it("matches the operator step once the draft has a column", () => {
      const { editor } = setup({ stages: [[A]] });
      insertDraft(
        editor,
        { from: 1, to: 1 },
        columnDraftContent(COLUMN_PART),
        0,
      );
      type(editor, "is");
      expect(findPartStep(editor.state.selection.$from)).toMatchObject({
        range: { from: 1, to: 8 },
        query: "is",
      });
    });

    it("does not match once the draft has an operator", () => {
      const { editor } = setup({ stages: [[A]] });
      insertDraft(
        editor,
        { from: 1, to: 1 },
        columnDraftContent(COLUMN_PART),
        0,
      );
      placeDraftInput(
        editor,
        getCaretDraft(editor),
        { column: COLUMN_PART, operator: toOperatorPart(LIST), values: [] },
        "value",
      );
      expect(findPartStep(editor.state.selection.$from)).toBeNull();
    });

    it("matches the draft up to the input of the edited part", () => {
      const { editor } = setupPillDraft(LIST, ["a"]);
      press(editor, "ArrowLeft");
      expect(findPartStep(editor.state.selection.$from)).toEqual({
        range: { from: 1, to: 5 },
        query: "",
        text: "",
      });
    });
  });

  describe("column part", () => {
    it("replaces the draft text with the column, the caret after it", () => {
      const { editor } = createWithDraft([A], 1, "st");
      insertDraft(
        editor,
        { from: 1, to: 7 },
        columnDraftContent(COLUMN_PART),
        0,
      );
      expect(findDraft(editor)).toEqual({ pos: 1, text: "" });
      expect(editor.state.selection.from).toBe(4);
    });

    it("keeps and / or as text after the column", () => {
      const { editor } = setup({ stages: [[A]] });
      insertDraft(
        editor,
        { from: 1, to: 1 },
        columnDraftContent(COLUMN_PART),
        0,
      );
      type(editor, "or ");
      expect(findDraft(editor)?.text).toBe("or ");
    });

    it("removes the column on Backspace right after it", () => {
      const { editor } = setup({ stages: [[A]] });
      insertDraft(
        editor,
        { from: 1, to: 1 },
        columnDraftContent(COLUMN_PART),
        0,
      );
      press(editor, "Backspace");
      expect(findDraft(editor)).toBeNull();
    });
  });

  describe("moving between parts", () => {
    it("edits the operator, then the column, on ArrowLeft", () => {
      const { editor, read, operatorPart } = setupPillDraft(LIST, ["a", "b"]);
      press(editor, "ArrowLeft");
      expect(read()).toMatchObject({
        step: "operator",
        edited: operatorPart,
        column: COLUMN_PART,
        values: ["a", "b"],
      });
      press(editor, "ArrowLeft");
      expect(read()).toMatchObject({ step: "column", edited: COLUMN_PART });
    });

    it("goes back to the values on ArrowRight", () => {
      const { editor, read } = setupPillDraft(LIST, ["a", "b"]);
      press(editor, "ArrowLeft");
      press(editor, "ArrowLeft");
      press(editor, "ArrowRight");
      expect(read()).toMatchObject({ step: "operator" });
      press(editor, "ArrowRight");
      expect(read()).toMatchObject({
        step: "value",
        edited: null,
        values: ["a", "b"],
      });
    });

    it("removes the edited operator and its values on Backspace", () => {
      const { editor, read } = setupPillDraft(LIST, ["a", "b"]);
      press(editor, "ArrowLeft");
      press(editor, "Backspace");
      expect(read()).toMatchObject({
        step: "operator",
        edited: null,
        column: COLUMN_PART,
        operator: null,
        values: [],
      });
    });

    it("edits a part on click", () => {
      const { editor, read } = setupPillDraft(LIST, ["a"]);
      const draft = getCaretDraft(editor);
      editClickedPart(editor, draft.node.child(0), draft.pos + 1);
      expect(read()).toMatchObject({ step: "column", edited: COLUMN_PART });
    });

    it("puts the edited part back on Escape", () => {
      const { editor, read, operatorPart } = setupPillDraft(LIST, ["a", "b"]);
      press(editor, "ArrowLeft");
      press(editor, "Escape");
      expect(read()).toMatchObject({
        step: "value",
        edited: null,
        operator: operatorPart,
        values: ["a", "b"],
      });
    });

    it("edits a single value in place", () => {
      const { read } = setupPillDraft(
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
      const { read } = setupPillDraft(BETWEEN, ["20", "100"]);
      expect(read()).toMatchObject({
        step: "value",
        texts: ["20", "100"],
        values: ["20", "100"],
      });
    });

    it("keeps an empty start of a range in its place", () => {
      const { editor, read, inputs } = setupPillDraft(BETWEEN, ["", "100"]);
      expect(read()).toMatchObject({ texts: ["", "100"], values: ["", "100"] });
      expect(editor.state.selection.from).toBe(inputs()[0].from);
    });

    it("moves between the ends of a range with the arrows", () => {
      const { editor, inputs } = setupPillDraft(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[1].from);
      press(editor, "ArrowLeft");
      expect(editor.state.selection.from).toBe(inputs()[0].to);
      press(editor, "ArrowRight");
      expect(editor.state.selection.from).toBe(inputs()[1].from);
    });

    it("keeps the range values when it edits the operator", () => {
      const { editor, read, inputs } = setupPillDraft(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[0].from);
      press(editor, "ArrowLeft");
      expect(read()).toMatchObject({
        step: "operator",
        values: ["20", "100"],
      });
      press(editor, "Escape");
      expect(read()).toMatchObject({ step: "value", texts: ["20", "100"] });
    });

    it("goes from the start of a range to its end on Tab", () => {
      const { editor, inputs } = setupPillDraft(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[0].from);
      press(editor, "Tab");
      expect(editor.state.selection.from).toBe(inputs()[1].to);
    });

    it("edits the part before on Shift+Tab", () => {
      const { editor, read } = setupPillDraft(BETWEEN, ["20", "100"]);
      press(editor, "Tab", { shiftKey: true });
      press(editor, "Tab", { shiftKey: true });
      expect(read()).toMatchObject({
        step: "operator",
        values: ["20", "100"],
      });
    });

    it("goes back to the values on Tab from the operator", () => {
      const { editor, read } = setupPillDraft(LIST, ["a"]);
      press(editor, "ArrowLeft");
      press(editor, "Tab");
      expect(read()).toMatchObject({ step: "value", values: ["a"] });
    });

    it("goes to the first end on Backspace at the start of the second", () => {
      const { editor, read, inputs } = setupPillDraft(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[1].from);
      press(editor, "Backspace");
      expect(editor.state.selection.from).toBe(inputs()[0].to);
      expect(read()).toMatchObject({ texts: ["20", "100"] });
    });

    it("keeps the and of a range on Delete at the end of its start", () => {
      const { editor, read, inputs } = setupPillDraft(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[0].to);
      expect(press(editor, "Delete")).toBe(true);
      expect(read()).toMatchObject({ texts: ["20", "100"] });
    });

    it("leaves Tab at the last input with no next part to others", () => {
      const { editor, inputs } = setupPillDraft(BETWEEN, ["20", "100"]);
      editor.commands.setTextSelection(inputs()[1].to);
      expect(press(editor, "Tab")).toBe(false);
    });

    it("adds no value node to a list with no values", () => {
      const { read } = setupPillDraft(LIST, []);
      expect(read()).toMatchObject({ step: "value", valuesPart: null });
    });
  });

  describe("placeholders", () => {
    const getPlaceholders = (editor: Editor) =>
      [...editor.view.dom.querySelectorAll("[data-placeholder]")].map(
        (element) => element.getAttribute("data-placeholder"),
      );

    it.each([
      { name: "the edited column", keys: 2, expected: ["C"] },
      { name: "the edited operator", keys: 1, expected: ["is"] },
    ])("shows the label of $name", ({ keys, expected }) => {
      const { editor } = setupPillDraft(
        LIST,
        ["a"],
        [createDraftPlaceholders()],
      );
      Array.from({ length: keys }).forEach(() => press(editor, "ArrowLeft"));
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
      const { editor } = setup({ stages: [[A, AND, B]] });
      insertPillDraft(
        editor,
        { from: 0, to: 1 },
        A,
        { column: COLUMN_PART, operator: toOperatorPart(LIST), values: [] },
        "value",
      );
      return { editor };
    };

    it("keeps the pill in the stages while it is edited", () => {
      const { editor } = editA();
      expect(getStages(editor)).toEqual([[A, AND, B]]);
    });

    it("puts the pill back when the caret leaves", () => {
      const { editor } = editA();
      editor.commands.setTextSelection(editor.state.doc.content.size);
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[A, AND, B]]);
    });

    it("removes the pill when its draft is erased", () => {
      const { editor } = editA();
      press(editor, "Backspace");
      press(editor, "Backspace");
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[AND, B]]);
    });

    it("puts the pill back on Escape", () => {
      const { editor } = editA();
      press(editor, "Escape");
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[A, AND, B]]);
    });
  });
});
