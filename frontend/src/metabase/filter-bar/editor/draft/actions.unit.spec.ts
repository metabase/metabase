import { Editor } from "@tiptap/core";

import { type Token, boolOpToken, pillToken } from "../../model";
import {
  MOCK_ADAPTER,
  type MockFilter,
  findDraft,
  getCaretDraft,
  getStages,
  mockFilter,
  mockSegment,
  press,
  type,
} from "../../test-utils";
import type {
  FilterBarAdapter,
  FilterColumn,
  FilterOperator,
} from "../../types";
import { tokensToContent } from "../document";
import { createEditorExtensions } from "../extensions";

import { addListValues, createDraftActions } from "./actions";
import { createDraftActionKeys } from "./plugins/action-keys";
import { getDraftRange, getInputRange, readDraft, readValues } from "./read";
import type { DraftStep } from "./types";

describe("addListValues", () => {
  it.each<[unknown[], string, unknown[]]>([
    [[], "", []],
    [[], "a, b,, c", ["a", "b", "c"]],
    [["a"], "b", ["a", "b"]],
    [["a"], "a, b", ["a", "b"]],
    [["a"], "b, b", ["a", "b"]],
    [[10], "10, 20", [10, "20"]],
    [["a"], "", ["a"]],
  ])("adds %j to %j", (values, text, expected) => {
    expect(addListValues(values, text)).toEqual(expected);
  });
});

const ID: FilterColumn = { key: "id", label: "ID", icon: "int" };
const SUBTOTAL: FilterColumn = {
  key: "subtotal",
  label: "Subtotal",
  icon: "int",
};
const STATUS: FilterColumn = { key: "status", label: "Status", icon: "string" };
const CREATED_AT: FilterColumn = {
  key: "created-at",
  label: "Created At",
  icon: "calendar",
};

const IS: FilterOperator = { key: "=", label: "is", valueKind: "multi" };
const IS_NOT: FilterOperator = {
  key: "!=",
  label: "is not",
  valueKind: "multi",
};
const GREATER: FilterOperator = {
  key: ">",
  label: "greater than",
  valueKind: "single",
};
const BETWEEN: FilterOperator = {
  key: "between",
  label: "is between",
  valueKind: "range",
};
const IS_EMPTY: FilterOperator = {
  key: "is-empty",
  label: "is empty",
  valueKind: "none",
};

const mockPill = (filter: MockFilter) =>
  pillToken(filter, MOCK_ADAPTER.stage(0).toPill(filter));

const START = { from: 0, to: 0 };

type SetupOpts = {
  stages?: Token<MockFilter>[][];
  adapter?: FilterBarAdapter<MockFilter>;
};

const setupEditor = ({
  stages = [],
  adapter = MOCK_ADAPTER,
}: SetupOpts = {}) => {
  const openFilterEditor = jest.fn();
  const actions = createDraftActions<MockFilter>({
    getAdapter: () => adapter,
    openFilterEditor,
  });
  const editor = new Editor({
    extensions: [
      ...createEditorExtensions({ caretClassName: "caret" }),
      createDraftActionKeys(actions),
    ],
    content: tokensToContent(stages),
  });
  return { editor, actions, openFilterEditor };
};

const setup = (
  column: FilterColumn,
  operator: FilterOperator,
  adapter?: FilterBarAdapter<MockFilter>,
) => {
  const testEditor = setupEditor({ adapter });
  const { editor, actions } = testEditor;
  actions.pickColumn(editor, START, column, 0);
  actions.pickOperator(editor, START, operator);
  const read = () => {
    const draft = getCaretDraft(editor);
    return { ...readDraft(draft), values: readValues(draft) };
  };
  return { ...testEditor, read };
};

const setupPill = (filter: MockFilter) => {
  const testEditor = setupEditor({ stages: [[mockPill(filter)]] });
  const read = () => {
    const draft = getCaretDraft(testEditor.editor);
    return { ...readDraft(draft), values: readValues(draft) };
  };
  return { ...testEditor, read };
};

describe("createDraftActions", () => {
  describe("commitDraft", () => {
    it("does not commit a range with an empty end", () => {
      const { editor } = setup(SUBTOTAL, BETWEEN);
      type(editor, "10");
      press(editor, "Enter");
      expect(findDraft(editor)).not.toBeNull();
      expect(getStages(editor)).toEqual([[]]);
    });

    it("commits a filter with no values", () => {
      const filter = mockFilter("status", "is-empty");
      const { editor, actions } = setupPill(filter);
      actions.editPill(editor, 0);
      press(editor, "Enter");
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([[mockPill(filter)]]);
    });

    it("keeps the draft when the adapter makes no filter", () => {
      const adapter: FilterBarAdapter<MockFilter> = {
        stage: (stage) => ({
          ...MOCK_ADAPTER.stage(stage),
          toFilter: () => null,
        }),
      };
      const { editor } = setup(SUBTOTAL, GREATER, adapter);
      type(editor, "5");
      press(editor, "Enter");
      expect(findDraft(editor)).not.toBeNull();
      expect(getStages(editor)).toEqual([[]]);
    });

    it("adds the typed text to the list values", () => {
      const { editor } = setup(SUBTOTAL, IS);
      type(editor, "1");
      press(editor, ",");
      type(editor, "2");
      press(editor, "Enter");
      expect(getStages(editor)).toEqual([
        [mockPill(mockFilter("subtotal", "=", "1", "2"))],
      ]);
    });
  });

  describe("addTypedValues", () => {
    it("turns the typed text into a list value on ,", () => {
      const { editor, read } = setup(SUBTOTAL, IS);
      type(editor, "1");
      expect(press(editor, ",")).toBe(true);
      expect(read()).toMatchObject({ text: "", values: ["1"] });
    });

    it("goes to the end of a range on , and then commits it", () => {
      const { editor, read } = setup(SUBTOTAL, BETWEEN);
      type(editor, "10");
      press(editor, ",");
      type(editor, "20");
      expect(read()).toMatchObject({ texts: ["10", "20"] });
      press(editor, ",");
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([
        [mockPill(mockFilter("subtotal", "between", "10", "20"))],
      ]);
    });

    it("leaves , in a single value to others", () => {
      const { editor } = setup(SUBTOTAL, GREATER);
      type(editor, "5");
      expect(press(editor, ",")).toBe(false);
    });
  });

  describe("tabInValues", () => {
    it("turns the typed text into a list value on Tab", () => {
      const { editor, read } = setup(SUBTOTAL, IS);
      type(editor, "1");
      press(editor, "Tab");
      expect(findDraft(editor)).not.toBeNull();
      expect(read()).toMatchObject({ text: "", values: ["1"] });
    });

    it("commits a list with no typed text on Tab", () => {
      const { editor } = setup(SUBTOTAL, IS);
      type(editor, "1");
      press(editor, "Tab");
      press(editor, "Tab");
      expect(getStages(editor)).toEqual([
        [mockPill(mockFilter("subtotal", "=", "1"))],
      ]);
    });

    it("commits a single value on Tab", () => {
      const { editor } = setup(SUBTOTAL, GREATER);
      type(editor, "5");
      press(editor, "Tab");
      expect(getStages(editor)).toEqual([
        [mockPill(mockFilter("subtotal", ">", "5"))],
      ]);
    });
  });

  describe("removeLastValue", () => {
    const setupList = () => {
      const testEditor = setup(SUBTOTAL, IS);
      type(testEditor.editor, "1");
      press(testEditor.editor, ",");
      type(testEditor.editor, "2");
      press(testEditor.editor, ",");
      return testEditor;
    };

    it("removes the last value on Backspace at the input start", () => {
      const { editor, read } = setupList();
      expect(press(editor, "Backspace")).toBe(true);
      expect(read()).toMatchObject({ values: ["1"] });
    });

    it("keeps the values on Backspace at the start of typed text", () => {
      const { editor, read } = setupList();
      type(editor, "x");
      editor.commands.setTextSelection(
        getInputRange(getCaretDraft(editor)).from,
      );
      expect(press(editor, "Backspace")).toBe(true);
      expect(read()).toMatchObject({ text: "x", values: ["1", "2"] });
    });

    it("leaves Backspace after typed text to others", () => {
      const { editor, read } = setupList();
      type(editor, "x");
      expect(press(editor, "Backspace")).toBe(false);
      expect(read()).toMatchObject({ text: "x", values: ["1", "2"] });
    });
  });

  describe("pickColumn", () => {
    it("opens the filter editor for a column with no operators", () => {
      const { editor, actions, openFilterEditor } = setupEditor();
      type(editor, "cr");
      actions.pickColumn(
        editor,
        getDraftRange(getCaretDraft(editor)),
        CREATED_AT,
        0,
      );
      expect(findDraft(editor)).toBeNull();
      expect(openFilterEditor).toHaveBeenCalledWith({
        type: "new",
        column: CREATED_AT,
        pos: 0,
        targetStage: 0,
      });
    });

    it("keeps an operator the new column has, with its values", () => {
      const { editor, actions, read } = setupPill(
        mockFilter("subtotal", "=", "1", "2"),
      );
      actions.editPill(editor, 0, "column");
      actions.pickColumn(editor, START, ID, 0);
      expect(read()).toMatchObject({
        step: "value",
        column: { column: ID },
        operator: { operator: IS },
        values: ["1", "2"],
      });
    });

    it("asks for an operator when the new column does not have it", () => {
      const { editor, actions, read } = setupPill(
        mockFilter("subtotal", "between", "1", "2"),
      );
      actions.editPill(editor, 0, "column");
      actions.pickColumn(editor, START, STATUS, 0);
      expect(read()).toMatchObject({
        step: "operator",
        column: { column: STATUS },
        operator: null,
        values: [],
      });
    });
  });

  describe("pickOperator", () => {
    it.each([
      { operator: IS_NOT, values: ["1", "2"] },
      { operator: GREATER, values: [] },
    ])("keeps $values for $operator.key", ({ operator, values }) => {
      const { editor, actions, read } = setupPill(
        mockFilter("subtotal", "=", "1", "2"),
      );
      actions.editPill(editor, 0, "operator");
      actions.pickOperator(editor, START, operator);
      expect(read()).toMatchObject({ step: "value", values });
    });

    it("commits an operator with no values right away", () => {
      const { editor } = setup(STATUS, IS_EMPTY);
      expect(findDraft(editor)).toBeNull();
      expect(getStages(editor)).toEqual([
        [mockPill(mockFilter("status", "is-empty"))],
      ]);
    });
  });

  describe("editPill", () => {
    it("opens the filter editor for a pill with no parts", () => {
      const filter = mockSegment("Active users");
      const { editor, actions, openFilterEditor } = setupPill(filter);
      expect(actions.editPill(editor, 0)).toBe(true);
      expect(findDraft(editor)).toBeNull();
      expect(openFilterEditor).toHaveBeenCalledWith({
        type: "edit",
        filter,
        pos: 0,
        targetStage: 0,
      });
    });

    it.each<DraftStep>(["column", "operator", "value"])(
      "edits the %s step",
      (step) => {
        const { editor, actions, read } = setupPill(
          mockFilter("subtotal", "=", "1"),
        );
        actions.editPill(editor, 0, step);
        expect(read()).toMatchObject({ step });
      },
    );
  });

  describe("editSelectedPill", () => {
    it("edits a selected pill on Enter", () => {
      const { editor, read } = setupPill(mockFilter("subtotal", "=", "1"));
      editor.commands.setNodeSelection(0);
      expect(press(editor, "Enter")).toBe(true);
      expect(read()).toMatchObject({ step: "value", values: ["1"] });
    });

    it.each<{
      name: string;
      select: (editor: Editor) => void;
    }>([
      {
        name: "a caret",
        select: (editor) => editor.commands.setTextSelection(0),
      },
      {
        name: "a selected bool op",
        select: (editor) => editor.commands.setNodeSelection(1),
      },
    ])("does nothing on ArrowDown with $name", ({ select }) => {
      const { editor } = setupEditor({
        stages: [[mockPill(mockFilter("id", ">", "1")), boolOpToken("or")]],
      });
      select(editor);
      expect(press(editor, "ArrowDown")).toBe(false);
      expect(findDraft(editor)).toBeNull();
    });
  });
});
