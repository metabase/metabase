import { type Editor, findChildren } from "@tiptap/core";

import { documentToTokens } from "./editor/document";
import { insertPillDraft } from "./editor/draft/layout";
import { findDraftAt } from "./editor/draft/read";
import { isDraftNode } from "./editor/nodes/types";
import {
  type PillToken,
  boolOpToken,
  closeToken,
  openToken,
  pillToken,
} from "./model";
import type {
  ColumnGroup,
  FilterBarAdapter,
  FilterBarStageAdapter,
  FilterColumn,
  FilterOperator,
  FilterOperatorGroup,
  FilterParts,
  FilterStages,
  FilterTree,
  PillContent,
} from "./types";

export const createTestPill = (name: string): PillContent => ({
  type: "opaque",
  displayName: name,
  icon: "filter",
});

const TEST_STAGE_ADAPTER: FilterBarStageAdapter<string> = {
  columnGroups: () => [],
  operators: () => [],
  toFilter: () => null,
  toPill: createTestPill,
  formatValues: () => "",
};

export const TEST_ADAPTER: FilterBarAdapter<string> = {
  stage: () => TEST_STAGE_ADAPTER,
};

export const pill = (filter: string): PillToken<string> =>
  pillToken(filter, createTestPill(filter));

export const AND = boolOpToken("and");
export const OR = boolOpToken("or");
export const OPEN = openToken();
export const CLOSE = closeToken();

export const leaf = <F>(filter: F): FilterTree<F> => ({ type: "leaf", filter });

export const and = <F>(...children: FilterTree<F>[]): FilterTree<F> => ({
  type: "and",
  children,
});

export const or = <F>(...children: FilterTree<F>[]): FilterTree<F> => ({
  type: "or",
  children,
});

export type MockFilter =
  | { type: "column"; column: string; operator: string; values: string[] }
  | { type: "segment"; name: string }
  | { type: "expression"; expression: string };

const NUMBER_OPERATORS: FilterOperatorGroup[] = [
  [{ key: "between", label: "is between", valueKind: "range" }],
  [
    { key: "=", label: "is", valueKind: "multi" },
    { key: "!=", label: "is not", valueKind: "multi" },
  ],
  [
    { key: ">", label: "greater than", valueKind: "single" },
    { key: ">=", label: "at least", valueKind: "single" },
    { key: "<", label: "less than", valueKind: "single" },
    { key: "<=", label: "at most", valueKind: "single" },
  ],
  [{ key: "is-empty", label: "is empty", valueKind: "none" }],
];

const TEXT_OPERATORS: FilterOperatorGroup[] = [
  [
    { key: "=", label: "is", valueKind: "multi" },
    { key: "!=", label: "is not", valueKind: "multi" },
  ],
  [{ key: "contains", label: "contains", valueKind: "single" }],
  [{ key: "is-empty", label: "is empty", valueKind: "none" }],
];

type MockColumn = {
  column: FilterColumn;
  operators: FilterOperatorGroup[] | null;
  stage: number;
};

const MOCK_COLUMNS: MockColumn[] = [
  {
    column: { key: "id", label: "ID", icon: "int" },
    operators: NUMBER_OPERATORS,
    stage: 0,
  },
  {
    column: { key: "subtotal", label: "Subtotal", icon: "int" },
    operators: NUMBER_OPERATORS,
    stage: 0,
  },
  {
    column: { key: "status", label: "Status", icon: "string" },
    operators: TEXT_OPERATORS,
    stage: 0,
  },
  {
    column: { key: "state", label: "State", icon: "string" },
    operators: TEXT_OPERATORS,
    stage: 0,
  },
  {
    column: { key: "created-at", label: "Created At", icon: "calendar" },
    operators: null,
    stage: 0,
  },
  {
    column: { key: "count", label: "Count", icon: "sum" },
    operators: NUMBER_OPERATORS,
    stage: 1,
  },
];

const MOCK_SEGMENTS = ["Active users"];

const findColumn = (key: string) =>
  MOCK_COLUMNS.find(({ column }) => column.key === key);

const toMockPill = (filter: MockFilter): PillContent => {
  if (filter.type === "segment") {
    return { type: "opaque", displayName: filter.name, icon: "segment" };
  }
  if (filter.type === "expression") {
    return { type: "expression", expression: filter.expression };
  }
  const mockColumn = findColumn(filter.column);
  const operator = mockColumn?.operators
    ?.flat()
    .find(({ key }) => key === filter.operator);
  if (!mockColumn || !operator) {
    return { type: "opaque", displayName: filter.column, icon: "filter" };
  }
  return {
    type: "parts",
    parts: { column: mockColumn.column, operator, values: filter.values },
  };
};

const formatMockValues = ({ values }: FilterParts): string =>
  values.map(String).join(", ");

const getMockColumnGroups = (stage: number): ColumnGroup<MockFilter>[] => [
  {
    label: "Orders",
    icon: "table",
    sections: [
      {
        items:
          stage === 0
            ? MOCK_SEGMENTS.map((name) => ({
                type: "filter",
                filter: { type: "segment", name },
                label: name,
                icon: "segment",
              }))
            : [],
      },
      {
        items: MOCK_COLUMNS.filter(
          (mockColumn) => mockColumn.stage === stage,
        ).map(({ column }) => ({ type: "column", column })),
      },
    ],
  },
  {
    label: "Summaries",
    icon: "sum",
    sections: [
      {
        items: MOCK_COLUMNS.filter(
          (mockColumn) => mockColumn.stage === stage + 1,
        ).map(({ column }) => ({
          type: "column",
          column,
          targetStage: stage + 1,
        })),
      },
    ],
  },
];

export const MOCK_ADAPTER: FilterBarAdapter<MockFilter> = {
  stage: (stage) => ({
    columnGroups: () => getMockColumnGroups(stage),
    operators: (column) => findColumn(column.key)?.operators ?? null,
    toFilter: ({ column, operator, values }) => ({
      type: "column",
      column: column.key,
      operator: operator.key,
      values: values.map(String),
    }),
    toPill: toMockPill,
    formatValues: formatMockValues,
  }),
};

export const mockFilter = (
  column: string,
  operator: string,
  ...values: string[]
): MockFilter => ({ type: "column", column, operator, values });

export const mockSegment = (name: string): MockFilter => ({
  type: "segment",
  name,
});

export const mockExpression = (expression: string): MockFilter => ({
  type: "expression",
  expression,
});

export const MOCK_STAGES: FilterStages<MockFilter> = [
  and(
    leaf(mockFilter("id", ">=", "10")),
    or(
      leaf(
        mockFilter(
          "status",
          "=",
          "paid",
          "shipped",
          "pending",
          "lost",
          "refunded",
        ),
      ),
      leaf(mockFilter("subtotal", "between", "20", "100")),
    ),
  ),
  leaf(mockFilter("count", ">", "5")),
];

export type KeyModifiers = Pick<
  KeyboardEventInit,
  "shiftKey" | "metaKey" | "ctrlKey" | "altKey"
>;

export const getStages = <F = string>(editor: Editor) =>
  documentToTokens<F>(editor.state.doc);

export const press = (
  editor: Editor,
  key: string,
  modifiers: KeyModifiers = {},
) =>
  Boolean(
    editor.view.someProp("handleKeyDown", (handle) =>
      handle(editor.view, new KeyboardEvent("keydown", { key, ...modifiers })),
    ),
  );

export const type = (editor: Editor, text: string) => {
  [...text].forEach((char) => {
    const { from, to } = editor.state.selection;
    const isHandled = editor.view.someProp("handleTextInput", (handle) =>
      handle(editor.view, from, to, char, () => editor.state.tr),
    );
    if (!isHandled) {
      editor.view.dispatch(editor.state.tr.insertText(char, from, to));
    }
  });
};

export const findDraft = (editor: Editor) => {
  const [draft] = findChildren(editor.state.doc, isDraftNode);
  return draft ? { pos: draft.pos, text: draft.node.textContent } : null;
};

export const getCaretDraft = (editor: Editor) => {
  const draft = findDraftAt(editor.state.selection.$from);
  if (!draft) {
    throw new Error("Expected a draft at the caret");
  }
  return draft;
};

const EDIT_COLUMN: FilterColumn = { key: "c", label: "C", icon: "int" };
const EDIT_OPERATOR: FilterOperator = {
  key: "=",
  label: "is",
  valueKind: "multi",
};

export const editPillAt = <F>(
  editor: Editor,
  pos: number,
  token: PillToken<F>,
  stage = 0,
) =>
  insertPillDraft(
    editor,
    { from: pos, to: pos + 1 },
    token,
    {
      column: { type: "column", column: EDIT_COLUMN, targetStage: stage },
      operator: { type: "operator", operator: EDIT_OPERATOR },
      values: [],
    },
    "value",
  );
