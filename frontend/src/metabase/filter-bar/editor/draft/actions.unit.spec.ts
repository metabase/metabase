import { boolOpToken, pillToken } from "../../model";
import {
  MOCK_ADAPTER,
  type MockFilter,
  mockFilter,
  mockSegment,
} from "../../test-utils";
import type {
  FilterBarAdapter,
  FilterColumn,
  FilterOperator,
} from "../../types";
import { createActionsTestEditor } from "../test-editor";

import { addListValues } from "./actions";
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

const setup = (
  column: FilterColumn,
  operator: FilterOperator,
  adapter?: FilterBarAdapter<MockFilter>,
) => {
  const testEditor = createActionsTestEditor({ adapter });
  const { editor, actions, getCaretDraft } = testEditor;
  actions.pickColumn(editor, START, column, 0);
  actions.pickOperator(editor, START, operator);
  const read = () => {
    const draft = getCaretDraft();
    return { ...readDraft(draft), values: readValues(draft) };
  };
  return { ...testEditor, read };
};

const setupPill = (filter: MockFilter) => {
  const testEditor = createActionsTestEditor({ stages: [[mockPill(filter)]] });
  const read = () => {
    const draft = testEditor.getCaretDraft();
    return { ...readDraft(draft), values: readValues(draft) };
  };
  return { ...testEditor, read };
};

describe("createDraftActions", () => {
  describe("commitDraft", () => {
    it("does not commit a range with an empty end", () => {
      const { findDraft, getStages, press, type } = setup(SUBTOTAL, BETWEEN);
      type("10");
      press("Enter");
      expect(findDraft()).not.toBeNull();
      expect(getStages()).toEqual([[]]);
    });

    it("commits a filter with no values", () => {
      const filter = mockFilter("status", "is-empty");
      const { editor, actions, findDraft, getStages, press } =
        setupPill(filter);
      actions.editPill(editor, 0);
      press("Enter");
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([[mockPill(filter)]]);
    });

    it("keeps the draft when the adapter makes no filter", () => {
      const adapter: FilterBarAdapter<MockFilter> = {
        stage: (stage) => ({
          ...MOCK_ADAPTER.stage(stage),
          toFilter: () => null,
        }),
      };
      const { findDraft, getStages, press, type } = setup(
        SUBTOTAL,
        GREATER,
        adapter,
      );
      type("5");
      press("Enter");
      expect(findDraft()).not.toBeNull();
      expect(getStages()).toEqual([[]]);
    });

    it("adds the typed text to the list values", () => {
      const { getStages, press, type } = setup(SUBTOTAL, IS);
      type("1");
      press(",");
      type("2");
      press("Enter");
      expect(getStages()).toEqual([
        [mockPill(mockFilter("subtotal", "=", "1", "2"))],
      ]);
    });
  });

  describe("addTypedValues", () => {
    it("turns the typed text into a list value on ,", () => {
      const { press, read, type } = setup(SUBTOTAL, IS);
      type("1");
      expect(press(",")).toBe(true);
      expect(read()).toMatchObject({ text: "", values: ["1"] });
    });

    it("goes to the end of a range on , and then commits it", () => {
      const { findDraft, getStages, press, read, type } = setup(
        SUBTOTAL,
        BETWEEN,
      );
      type("10");
      press(",");
      type("20");
      expect(read()).toMatchObject({ texts: ["10", "20"] });
      press(",");
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([
        [mockPill(mockFilter("subtotal", "between", "10", "20"))],
      ]);
    });

    it("leaves , in a single value to others", () => {
      const { press, type } = setup(SUBTOTAL, GREATER);
      type("5");
      expect(press(",")).toBe(false);
    });
  });

  describe("tabInValues", () => {
    it("turns the typed text into a list value on Tab", () => {
      const { findDraft, press, read, type } = setup(SUBTOTAL, IS);
      type("1");
      press("Tab");
      expect(findDraft()).not.toBeNull();
      expect(read()).toMatchObject({ text: "", values: ["1"] });
    });

    it("commits a list with no typed text on Tab", () => {
      const { getStages, press, type } = setup(SUBTOTAL, IS);
      type("1");
      press("Tab");
      press("Tab");
      expect(getStages()).toEqual([
        [mockPill(mockFilter("subtotal", "=", "1"))],
      ]);
    });

    it("commits a single value on Tab", () => {
      const { getStages, press, type } = setup(SUBTOTAL, GREATER);
      type("5");
      press("Tab");
      expect(getStages()).toEqual([
        [mockPill(mockFilter("subtotal", ">", "5"))],
      ]);
    });
  });

  describe("removeLastValue", () => {
    const setupList = () => {
      const testEditor = setup(SUBTOTAL, IS);
      testEditor.type("1");
      testEditor.press(",");
      testEditor.type("2");
      testEditor.press(",");
      return testEditor;
    };

    it("removes the last value on Backspace at the input start", () => {
      const { press, read } = setupList();
      expect(press("Backspace")).toBe(true);
      expect(read()).toMatchObject({ values: ["1"] });
    });

    it("keeps the values on Backspace at the start of typed text", () => {
      const { editor, getCaretDraft, press, read, type } = setupList();
      type("x");
      editor.commands.setTextSelection(getInputRange(getCaretDraft()).from);
      expect(press("Backspace")).toBe(true);
      expect(read()).toMatchObject({ text: "x", values: ["1", "2"] });
    });

    it("leaves Backspace after typed text to others", () => {
      const { press, read, type } = setupList();
      type("x");
      expect(press("Backspace")).toBe(false);
      expect(read()).toMatchObject({ text: "x", values: ["1", "2"] });
    });
  });

  describe("pickColumn", () => {
    it("opens the filter editor for a column with no operators", () => {
      const {
        editor,
        actions,
        findDraft,
        getCaretDraft,
        openFilterEditor,
        type,
      } = createActionsTestEditor();
      type("cr");
      actions.pickColumn(editor, getDraftRange(getCaretDraft()), CREATED_AT, 0);
      expect(findDraft()).toBeNull();
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
      const { findDraft, getStages } = setup(STATUS, IS_EMPTY);
      expect(findDraft()).toBeNull();
      expect(getStages()).toEqual([
        [mockPill(mockFilter("status", "is-empty"))],
      ]);
    });
  });

  describe("editPill", () => {
    it("opens the filter editor for a pill with no parts", () => {
      const filter = mockSegment("Active users");
      const { editor, actions, findDraft, openFilterEditor } =
        setupPill(filter);
      expect(actions.editPill(editor, 0)).toBe(true);
      expect(findDraft()).toBeNull();
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
      const { press, read, selectNode } = setupPill(
        mockFilter("subtotal", "=", "1"),
      );
      selectNode(0);
      expect(press("Enter")).toBe(true);
      expect(read()).toMatchObject({ step: "value", values: ["1"] });
    });

    it.each<{
      name: string;
      select: (testEditor: ReturnType<typeof createActionsTestEditor>) => void;
    }>([
      { name: "a caret", select: ({ placeCaret }) => placeCaret(0) },
      {
        name: "a selected bool op",
        select: ({ selectNode }) => selectNode(1),
      },
    ])("does nothing on ArrowDown with $name", ({ select }) => {
      const testEditor = createActionsTestEditor({
        stages: [[mockPill(mockFilter("id", ">", "1")), boolOpToken("or")]],
      });
      const { findDraft, press } = testEditor;
      select(testEditor);
      expect(press("ArrowDown")).toBe(false);
      expect(findDraft()).toBeNull();
    });
  });
});
