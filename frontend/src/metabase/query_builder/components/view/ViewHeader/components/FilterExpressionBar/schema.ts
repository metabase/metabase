import * as Lib from "metabase-lib";

import type { DraftColumn, DraftOperator } from "../KeyboardFilterRow/types";
import {
  getColumnGroups,
  getOperatorAliases,
  getPillOperatorLabel,
} from "../KeyboardFilterRow/utils";

export type SchemaOperator = {
  key: string;
  /** The label written back into the text, like "is greater than". */
  label: string;
  /** Lower-cased texts that find the operator, longest match wins. */
  aliases: string[];
  needsValue: boolean;
  isMulti: boolean;
  isRange: boolean;
  draft: DraftOperator;
};

export type SchemaField = {
  key: string;
  /** The column name, like "Category". */
  label: string;
  /** The table, like "Product". */
  tableLabel: string;
  /** The text written back into the bar: the name, or "Table Name" when the name is ambiguous. */
  text: string;
  /** Lower-cased texts that find the field, longest match wins. */
  aliases: string[];
  column: DraftColumn;
  /** Undefined when the bar cannot edit the column inline, like dates. */
  operators: SchemaOperator[] | undefined;
};

export type FilterSchema = {
  query: Lib.Query;
  stageIndex: number;
  fields: SchemaField[];
  segments: Lib.SegmentMetadata[];
  getField: (key: string | null | undefined) => SchemaField | undefined;
  getOperator: (
    field: SchemaField | undefined,
    key: string | null | undefined,
  ) => SchemaOperator | undefined;
  /** The field of a column of the query, by meaning. */
  findField: (column: Lib.ColumnMetadata) => SchemaField | undefined;
};

/**
 * Words that find an operator besides its label and symbols, from the v2
 * hand-off doc. Keys are the operator keys of the filter pickers.
 */
const WORD_ALIASES: Partial<Record<string, string[]>> = {
  "=": ["is", "equals", "equal to", "is any of", "any of", "one of", "in"],
  "!=": ["is not", "not", "not equal to", "is none of", "none of", "not in"],
  ">": ["greater than", "more than", "over", "above"],
  "<": ["less than", "under", "below"],
  ">=": ["at least", "greater than or equal to"],
  "<=": ["at most", "less than or equal to"],
  between: ["between"],
  contains: ["contains", "has", "includes"],
  "does-not-contain": ["does not contain", "doesn't contain", "excludes"],
  "starts-with": ["starts with", "begins with"],
  "ends-with": ["ends with"],
  "is-empty": ["is empty", "empty", "is null"],
  "not-empty": ["is not empty", "not empty", "is not null"],
  "is-null": ["is empty", "empty", "is null"],
  "not-null": ["is not empty", "not empty", "is not null"],
};

export function toSchemaOperator(operator: DraftOperator): SchemaOperator {
  const label = getPillOperatorLabel(operator);
  const lowerLabel = operator.label.toLowerCase();
  const aliases = new Set([
    label,
    lowerLabel,
    ...(getOperatorAliases(operator) ?? []),
    ...(WORD_ALIASES[operator.key] ?? []),
  ]);
  return {
    key: operator.key,
    label,
    aliases: [...aliases].map((alias) => alias.toLowerCase()),
    needsValue: operator.valueKind !== "none",
    isMulti: operator.valueKind === "multi",
    isRange: operator.valueKind === "range",
    draft: operator,
  };
}

/** The fields and operators of the stage, for the parser and the popovers. */
export function getFilterSchema(
  query: Lib.Query,
  stageIndex: number,
): FilterSchema {
  const groups = getColumnGroups(query, stageIndex);
  const nameCounts = new Map<string, number>();
  groups.forEach((group) =>
    group.columns.forEach(({ label }) => {
      const name = label.toLowerCase();
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }),
  );
  const claimedNames = new Set<string>();

  const fields = groups.flatMap((group, groupIndex) =>
    group.columns.map((column, columnIndex): SchemaField => {
      const name = column.label.toLowerCase();
      // The first table with a column name, usually the source table, gets
      // the bare name. The others need the table name.
      const ownsName = !claimedNames.has(name);
      claimedNames.add(name);
      const tableName = `${group.label} ${column.label}`;
      const aliases = [
        tableName,
        `${group.label}.${column.label}`,
        `${group.label} → ${column.label}`,
        ...(ownsName ? [column.label] : []),
      ].map((alias) => alias.toLowerCase());
      return {
        key: `${groupIndex}:${columnIndex}`,
        label: column.label,
        tableLabel: group.label,
        text:
          ownsName || (nameCounts.get(name) ?? 0) <= 1
            ? column.label
            : tableName,
        aliases,
        column,
        operators: column.operators?.map(toSchemaOperator),
      };
    }),
  );

  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const columns = fields.map((field) => field.column.column);

  return {
    query,
    stageIndex,
    fields,
    segments: groups.flatMap((group) => group.segments),
    getField: (key) => (key != null ? fieldsByKey.get(key) : undefined),
    getOperator: (field, key) =>
      field?.operators?.find((operator) => operator.key === key),
    findField: (column) => {
      const match = Lib.findMatchingColumn(query, stageIndex, column, columns);
      return match != null ? fields[columns.indexOf(match)] : undefined;
    },
  };
}

/** The field name as the pill shows it, with the table when it is ambiguous. */
export function getFieldDisplayName(field: SchemaField) {
  return field.text === field.label
    ? field.label
    : `${field.tableLabel} → ${field.label}`;
}
