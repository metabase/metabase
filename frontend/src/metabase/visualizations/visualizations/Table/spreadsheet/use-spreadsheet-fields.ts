import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { isNumber } from "metabase-lib/v1/types/utils/isa";
import type { RowValue } from "metabase-types/api";

import type { VisibleTableData } from "../../../lib/visible-table-data";

import {
  type FormulaAstNode,
  FormulaParseError,
  evaluateFormula,
  getReferencedColumns,
  parseFormula,
} from "./formula-engine";
import type { SpreadsheetField, SpreadsheetFormulaField } from "./types";

let nextFormulaFieldId = 1;

function toNumericOrNull(value: RowValue): number | null {
  if (
    value == null ||
    typeof value === "boolean" ||
    typeof value === "object"
  ) {
    return null;
  }
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export interface SpreadsheetCell {
  /** Numeric value, or null if blank/non-numeric/errored. */
  value: number | null;
  /** Raw display value for source columns (may be a string, date, etc.). */
  rawValue: RowValue;
  error: string | null;
}

export function useSpreadsheetFields(data: VisibleTableData) {
  const [formulaFields, setFormulaFields] = useState<SpreadsheetFormulaField[]>(
    [],
  );

  const sourceFields = useMemo<SpreadsheetField[]>(
    () =>
      data.cols.map((column, index) => ({
        kind: "source" as const,
        id: column.name,
        name: column.display_name ?? column.name,
        column,
        sourceColumnIndex: index,
        isNumeric: isNumber(column),
      })),
    [data.cols],
  );

  const fields = useMemo<SpreadsheetField[]>(
    () => [...sourceFields, ...formulaFields],
    [sourceFields, formulaFields],
  );

  // Resolves [Column Name] to a grid column, case-insensitively, so a
  // formula can name a column the way Metabase's own expressions do.
  const getColumnIndex = useMemo(() => {
    const byName = new Map<string, number>();
    fields.forEach((field, index) => {
      byName.set(field.name.trim().toLowerCase(), index);
    });
    return (name: string) => byName.get(name.trim().toLowerCase()) ?? null;
  }, [fields]);

  // Parse every formula once per formula-text change, and detect cycles
  // among formula fields (a formula field referencing, directly or
  // transitively, its own column).
  const { parsedByColumn, anchorRowByColumn, fieldErrors } = useMemo(() => {
    const parsedByColumn = new Map<number, FormulaAstNode>();
    const anchorRowByColumn = new Map<number, number>();
    const parseErrors = new Map<number, string>();

    formulaFields.forEach((field, i) => {
      const colIndex = sourceFields.length + i;
      anchorRowByColumn.set(colIndex, field.anchorRow);
      try {
        parsedByColumn.set(colIndex, parseFormula(field.formula));
      } catch (err) {
        parseErrors.set(
          colIndex,
          err instanceof FormulaParseError ? err.message : "#ERROR!",
        );
      }
    });

    // Build a dependency graph between formula columns only (source
    // columns are always leaves) and detect cycles via DFS.
    const formulaColumnIndexes = new Set(parsedByColumn.keys());
    const dependsOn = new Map<number, number[]>();
    for (const [colIndex, ast] of parsedByColumn) {
      dependsOn.set(
        colIndex,
        getReferencedColumns(ast).filter((c) => formulaColumnIndexes.has(c)),
      );
    }

    const state = new Map<number, "visiting" | "done">();
    const cyclic = new Set<number>();
    const visit = (colIndex: number, stack: number[]) => {
      if (state.get(colIndex) === "done") {
        return;
      }
      if (state.get(colIndex) === "visiting") {
        stack.forEach((c) => cyclic.add(c));
        cyclic.add(colIndex);
        return;
      }
      state.set(colIndex, "visiting");
      for (const dep of dependsOn.get(colIndex) ?? []) {
        visit(dep, [...stack, colIndex]);
      }
      state.set(colIndex, "done");
    };
    for (const colIndex of formulaColumnIndexes) {
      visit(colIndex, []);
    }

    const fieldErrors = new Map<number, string>();
    parseErrors.forEach((message, colIndex) =>
      fieldErrors.set(colIndex, message),
    );
    cyclic.forEach((colIndex) => {
      if (!fieldErrors.has(colIndex)) {
        fieldErrors.set(
          colIndex,
          t`#CIRCULAR! (this formula refers to itself)`,
        );
      }
    });

    return { parsedByColumn, anchorRowByColumn, fieldErrors };
  }, [formulaFields, sourceFields.length]);

  // getCellValue is recreated whenever the data or formulas change; a
  // fresh evaluation cache is scoped to each instance so results are
  // memoized within a single render pass but never go stale.
  const getCellValue = useMemo(() => {
    const cache = new Map<string, number | null>();

    const resolve = (rowIndex: number, colIndex: number): number | null => {
      const cacheKey = `${rowIndex}:${colIndex}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey) ?? null;
      }
      // Guard against runaway recursion the static cycle check missed.
      cache.set(cacheKey, null);

      let result: number | null = null;
      if (colIndex < sourceFields.length) {
        const row = data.rows[rowIndex];
        result = row ? toNumericOrNull(row[colIndex]) : null;
      } else if (!fieldErrors.has(colIndex)) {
        const ast = parsedByColumn.get(colIndex);
        if (ast) {
          try {
            result = evaluateFormula(
              ast,
              rowIndex,
              {
                getCellValue: resolve,
                rowCount: data.rows.length,
                getColumnIndex,
              },
              anchorRowByColumn.get(colIndex) ?? 0,
            );
          } catch {
            result = null;
          }
        }
      }

      cache.set(cacheKey, result);
      return result;
    };

    return resolve;
  }, [
    data.rows,
    sourceFields.length,
    parsedByColumn,
    anchorRowByColumn,
    fieldErrors,
    getColumnIndex,
  ]);

  const getCell = useCallback(
    (rowIndex: number, colIndex: number): SpreadsheetCell => {
      if (colIndex < sourceFields.length) {
        const row = data.rows[rowIndex];
        const rawValue = row ? row[colIndex] : null;
        return { value: toNumericOrNull(rawValue), rawValue, error: null };
      }

      const error = fieldErrors.get(colIndex) ?? null;
      if (error) {
        return { value: null, rawValue: null, error };
      }

      const ast = parsedByColumn.get(colIndex);
      if (!ast) {
        return { value: null, rawValue: null, error: null };
      }
      try {
        const value = evaluateFormula(
          ast,
          rowIndex,
          { getCellValue, rowCount: data.rows.length, getColumnIndex },
          anchorRowByColumn.get(colIndex) ?? 0,
        );
        return { value, rawValue: value, error: null };
      } catch (err) {
        return {
          value: null,
          rawValue: null,
          error: err instanceof Error ? err.message : "#ERROR!",
        };
      }
    },
    [
      data.rows,
      sourceFields.length,
      parsedByColumn,
      anchorRowByColumn,
      fieldErrors,
      getCellValue,
      getColumnIndex,
    ],
  );

  const addFormulaField = useCallback(
    (name: string, formula: string, anchorRow: number, saveError?: string) => {
      setFormulaFields((prev) => [
        ...prev,
        {
          kind: "formula",
          id: `fx-${nextFormulaFieldId++}`,
          name,
          formula,
          anchorRow,
          saveError,
        },
      ]);
    },
    [],
  );

  const removeFormulaField = useCallback((id: string) => {
    setFormulaFields((prev) => prev.filter((field) => field.id !== id));
  }, []);

  const updateFormulaField = useCallback(
    (
      id: string,
      updates: Partial<
        Pick<
          SpreadsheetFormulaField,
          "name" | "formula" | "anchorRow" | "saveError"
        >
      >,
    ) => {
      setFormulaFields((prev) =>
        prev.map((field) =>
          field.id === id ? { ...field, ...updates } : field,
        ),
      );
    },
    [],
  );

  return {
    fields,
    getCell,
    fieldErrors,
    addFormulaField,
    removeFormulaField,
    updateFormulaField,
  };
}
