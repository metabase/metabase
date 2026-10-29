import type { PillItem } from "./query-sync";
import type { FilterSchema, SchemaField } from "./schema";

/** How long a mock answer takes, so the loading pill shows. */
export const MOCK_AI_DELAY_MS = 800;

type MockFilter = {
  /** Column names to look for, the first one found wins. */
  columnNames: string[];
  operatorKey: string;
  values: string[];
  /** Values for a country column, which stores country codes. */
  countryCodes?: string[];
};

type MockPrompt = {
  pattern: RegExp;
  filters: MockFilter[];
};

const FRANCOPHONE_COUNTRIES = [
  "Canada",
  "France",
  "Belgium",
  "Switzerland",
  "Luxembourg",
  "Monaco",
];

/**
 * Prototype: canned answers for the demo, so the AI pills work on an
 * instance without an AI provider. Each one applies only when the table has
 * its columns.
 */
const MOCK_PROMPTS: MockPrompt[] = [
  {
    pattern: /franco|french/i,
    filters: [
      {
        columnNames: ["Country"],
        operatorKey: "=",
        values: FRANCOPHONE_COUNTRIES,
        countryCodes: ["CA", "FR", "BE", "CH", "LU", "MC"],
      },
    ],
  },
  {
    pattern: /west coast/i,
    filters: [
      { columnNames: ["State"], operatorKey: "=", values: ["CA", "OR", "WA"] },
    ],
  },
  {
    pattern: /social/i,
    filters: [
      {
        columnNames: ["Source"],
        operatorKey: "=",
        values: ["Facebook", "Twitter"],
      },
    ],
  },
  {
    pattern: /(big|large|expensive) orders/i,
    filters: [{ columnNames: ["Total"], operatorKey: ">", values: ["100"] }],
  },
  {
    pattern: /cheap gadgets/i,
    filters: [
      { columnNames: ["Category"], operatorKey: "=", values: ["Gadget"] },
      { columnNames: ["Price"], operatorKey: "<", values: ["30"] },
    ],
  },
  {
    pattern: /gizmos? and widgets?|widgets? and gizmos?/i,
    filters: [
      {
        columnNames: ["Category"],
        operatorKey: "=",
        values: ["Gizmo", "Widget"],
      },
    ],
  },
];

function findField(schema: FilterSchema, columnNames: string[]) {
  for (const name of columnNames) {
    const lowerName = name.toLowerCase();
    // The column of the source table first, which has the bare name.
    const field =
      schema.fields.find(
        (field) =>
          field.label.toLowerCase() === lowerName && field.text === field.label,
      ) ??
      schema.fields.find((field) => field.label.toLowerCase() === lowerName);
    if (field != null) {
      return field;
    }
  }
  return undefined;
}

function getValues(field: SchemaField, filter: MockFilter) {
  const isCountryColumn = field.operators?.some(
    (op) => op.draft.formatValue != null,
  );
  return isCountryColumn && filter.countryCodes != null
    ? filter.countryCodes
    : filter.values;
}

/**
 * The pills of a mock answer to a prompt, or undefined when no mock matches
 * the prompt or the table lacks one of its columns.
 */
export function getMockAiItems(
  prompt: string,
  schema: FilterSchema,
): PillItem[] | undefined {
  const mock = MOCK_PROMPTS.find(({ pattern }) => pattern.test(prompt));
  if (mock == null) {
    return undefined;
  }
  const items: PillItem[] = [];
  for (const filter of mock.filters) {
    const field = findField(schema, filter.columnNames);
    const op = schema.getOperator(field, filter.operatorKey);
    if (field == null || op == null) {
      return undefined;
    }
    items.push({
      attrs: {
        columnKey: field.key,
        operatorKey: op.key,
        values: getValues(field, filter),
      },
    });
  }
  return items;
}
