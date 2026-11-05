import { useState } from "react";
import { t } from "ttag";

import {
  type PrototypeAiValueKind,
  type PrototypeFiltersRequest,
  useSuggestPrototypeFiltersMutation,
} from "metabase/api";
import { dayjs } from "metabase/dayjs";
import * as Lib from "metabase-lib";

import type { DraftOperator } from "./types";
import { getColumnGroups, getDraftFilterClause, isValidValue } from "./utils";

/** The value of the option in the column step that asks the AI for filters. */
export const AI_FILTERS_OPTION = "ai-filters";

/** The column search offers the AI first for a text with this many words. */
const SENTENCE_WORD_COUNT = 3;

export function isAiFiltersPrompt(text: string) {
  return text.trim().split(/\s+/).length >= SENTENCE_WORD_COUNT;
}

type AiOperator = {
  key: string;
  label: string;
  valueKind: PrototypeAiValueKind;
  options?: string[];
  getFilterClause: (values: string[]) => Lib.ExpressionClause | undefined;
};

type AiColumn = {
  table: string;
  name: string;
  kind: PrototypeFiltersRequest["columns"][number]["kind"];
  fieldId: number | null;
  operators: AiOperator[];
};

const RELATIVE_UNITS: Lib.RelativeDateFilterUnit[] = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

function parseUnit(value: string) {
  return RELATIVE_UNITS.find((unit) => unit === value.toLowerCase());
}

function parseDate(value: string) {
  const date = dayjs(value);
  return date.isValid() ? date.toDate() : undefined;
}

function getRelativeOperator(
  column: Lib.ColumnMetadata,
  key: "last" | "next",
  label: string,
): AiOperator {
  return {
    key,
    label,
    valueKind: "amount-unit",
    getFilterClause: ([amount, unitValue]) => {
      const count = Number(amount);
      const unit = parseUnit(unitValue);
      if (!Number.isInteger(count) || count <= 0 || unit == null) {
        return undefined;
      }
      return Lib.relativeDateFilterClause({
        column,
        value: key === "last" ? -count : count,
        unit,
        offsetValue: null,
        offsetUnit: null,
        options: {},
      });
    },
  };
}

/**
 * Prototype: an open-ended relative filter, like "more than 40 years ago"
 * for "older than 40". The date picker cannot make it, so the pill shows it
 * as an expression.
 */
function getAgoOperator(
  column: Lib.ColumnMetadata,
  key: "more-than-ago" | "less-than-ago",
  label: string,
): AiOperator {
  return {
    key,
    label,
    valueKind: "amount-unit",
    getFilterClause: ([amount, unitValue]) => {
      const count = Number(amount);
      const unit = parseUnit(unitValue);
      if (!Number.isInteger(count) || count <= 0 || unit == null) {
        return undefined;
      }
      return Lib.expressionClause(key === "more-than-ago" ? "<" : ">=", [
        column,
        Lib.expressionClause("relative-datetime", [-count, unit]),
      ]);
    },
  };
}

function getSpecificOperator(
  column: Lib.ColumnMetadata,
  key: string,
  label: string,
  operator: Lib.SpecificDateFilterOperator,
): AiOperator {
  return {
    key,
    label,
    valueKind: operator === "between" ? "range" : "single",
    getFilterClause: (values) => {
      const dates = values.map(parseDate);
      if (dates.some((date) => date == null)) {
        return undefined;
      }
      return Lib.specificDateFilterClause({
        operator,
        column,
        values: dates.filter((date) => date != null),
        hasTime: values.some((value) => value.includes("T")),
      });
    },
  };
}

/**
 * Prototype: the inline pill has no date operators, so the AI gets its own
 * date operators, like "last 30 days".
 */
function getDateOperators(column: Lib.ColumnMetadata): AiOperator[] {
  return [
    getRelativeOperator(column, "last", t`In the previous`),
    getRelativeOperator(column, "next", t`In the next`),
    getAgoOperator(column, "more-than-ago", t`More than N units ago`),
    getAgoOperator(column, "less-than-ago", t`Less than N units ago`),
    {
      key: "current",
      label: t`In the current`,
      valueKind: "unit",
      getFilterClause: ([unitValue]) => {
        const unit = parseUnit(unitValue);
        return unit != null
          ? Lib.relativeDateFilterClause({
              column,
              value: 0,
              unit,
              offsetValue: null,
              offsetUnit: null,
              options: {},
            })
          : undefined;
      },
    },
    getSpecificOperator(column, "on", t`On`, "="),
    getSpecificOperator(column, "before", t`Before`, "<"),
    getSpecificOperator(column, "after", t`After`, ">"),
    getSpecificOperator(column, "between", t`Between`, "between"),
    {
      key: "is-null",
      label: t`Is empty`,
      valueKind: "none",
      getFilterClause: () =>
        Lib.defaultFilterClause({ operator: "is-null", column }),
    },
    {
      key: "not-null",
      label: t`Is not empty`,
      valueKind: "none",
      getFilterClause: () =>
        Lib.defaultFilterClause({ operator: "not-null", column }),
    },
  ];
}

function toAiOperator(operator: DraftOperator): AiOperator {
  return {
    key: operator.key,
    label: operator.label,
    valueKind: operator.valueKind,
    options: operator.options?.map((option) => option.value),
    getFilterClause: (values) =>
      values.every((value) => isValidValue(operator, value))
        ? getDraftFilterClause({ operator, values })
        : undefined,
  };
}

/** The columns that the AI can filter on, with the operators of each. */
function getAiColumns(query: Lib.Query, stageIndex: number): AiColumn[] {
  return getColumnGroups(query, stageIndex).flatMap((group) =>
    group.columns.flatMap(({ column, label, kind, operators }): AiColumn[] => {
      const fieldId = Lib.fieldValuesSearchInfo(query, column).fieldId;
      const base = { table: group.label, name: label, fieldId };
      if (operators != null && kind !== "other") {
        return [{ ...base, kind, operators: operators.map(toAiOperator) }];
      }
      if (Lib.isDateOrDateTime(column)) {
        return [{ ...base, kind: "date", operators: getDateOperators(column) }];
      }
      return [];
    }),
  );
}

export type AiFiltersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; reason?: string };

interface UseAiFiltersOpts {
  query: Lib.Query;
  stageIndex: number;
  onFilters: (filters: Lib.ExpressionClause[]) => void;
}

/**
 * Prototype: asks the LLM of the instance for one or more filters from a
 * request in natural language, like "pro customers in the EU". It is one call
 * to the LLM, with no agent loop.
 */
export function useAiFilters({
  query,
  stageIndex,
  onFilters,
}: UseAiFiltersOpts) {
  const [suggestFilters] = useSuggestPrototypeFiltersMutation();
  const [state, setState] = useState<AiFiltersState>({ status: "idle" });

  const ask = async (text: string) => {
    const prompt = text.trim();
    if (prompt.length === 0 || state.status === "loading") {
      return;
    }
    setState({ status: "loading" });
    const columns = getAiColumns(query, stageIndex);
    try {
      const response = await suggestFilters({
        prompt,
        today: dayjs().format("YYYY-MM-DD"),
        columns: columns.map((column, index) => ({
          id: index,
          table: column.table,
          name: column.name,
          kind: column.kind,
          field_id: column.fieldId,
          operators: column.operators.map((operator) => ({
            key: operator.key,
            label: operator.label,
            value_kind: operator.valueKind,
            options: operator.options,
          })),
        })),
      }).unwrap();
      if (response.status === "rejected") {
        setState({
          status: "error",
          message: t`Sorry, we couldn't create filters for this request. Rephrase it, or pick a column.`,
          reason: response.reason,
        });
        return;
      }
      const filters = response.filters.map(({ column, operator, values }) =>
        columns[column]?.operators
          .find(({ key }) => key === operator)
          ?.getFilterClause(values),
      );
      if (filters.length === 0 || filters.some((filter) => filter == null)) {
        setState({
          status: "error",
          message: t`Sorry, we couldn't create filters for this request. Rephrase it, or pick a column.`,
          reason: t`The AI gave a filter that is not valid.`,
        });
        return;
      }
      setState({ status: "idle" });
      onFilters(filters.filter((filter) => filter != null));
    } catch {
      setState({
        status: "error",
        message: t`The AI could not answer. Try again, or pick a column.`,
      });
    }
  };

  const reset = () => {
    if (state.status === "error") {
      setState({ status: "idle" });
    }
  };

  return { state, ask, reset };
}
