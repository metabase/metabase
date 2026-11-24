import type { Token } from "./model/types";
import {
  closeToken,
  connectorToken,
  openToken,
  pillToken,
} from "./model/utils";
import type {
  ColumnGroup,
  FilterBarAdapter,
  FilterBarStageAdapter,
  FilterColumn,
  FilterOperator,
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
  supportsOr: true,
  stage: () => TEST_STAGE_ADAPTER,
};

export const pill = (filter: string): Token<string> =>
  pillToken(filter, createTestPill(filter));

export const AND = connectorToken("and");
export const OR = connectorToken("or");
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

const NUMBER_OPERATORS: FilterOperator[] = [
  { key: "=", label: "is", valueKind: "multi" },
  { key: "!=", label: "is not", valueKind: "multi" },
  { key: ">", label: "greater than", valueKind: "single" },
  { key: "<", label: "less than", valueKind: "single" },
  { key: ">=", label: "at least", valueKind: "single" },
  { key: "<=", label: "at most", valueKind: "single" },
  { key: "between", label: "is between", valueKind: "range" },
  { key: "is-empty", label: "is empty", valueKind: "none" },
];

const TEXT_OPERATORS: FilterOperator[] = [
  { key: "=", label: "is", valueKind: "multi" },
  { key: "!=", label: "is not", valueKind: "multi" },
  { key: "contains", label: "contains", valueKind: "single" },
  { key: "is-empty", label: "is empty", valueKind: "none" },
];

type MockColumn = {
  column: FilterColumn;
  operators: FilterOperator[] | null;
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
  const operator = mockColumn?.operators?.find(
    ({ key }) => key === filter.operator,
  );
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
        ).map(({ column }) => ({ type: "column", column, stage: stage + 1 })),
      },
    ],
  },
];

export const MOCK_ADAPTER: FilterBarAdapter<MockFilter> = {
  supportsOr: true,
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
    leaf(mockSegment("Active users")),
    leaf(mockExpression("[Subtotal] * [Tax] > 10")),
  ),
  leaf(mockFilter("count", ">", "5")),
];
