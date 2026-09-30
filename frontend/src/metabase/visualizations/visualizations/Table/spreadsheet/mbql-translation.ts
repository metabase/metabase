/**
 * Translates a formula-field's formula into Metabase's own custom-column
 * expression syntax (e.g. "[Subtotal] / [Tax]"), so it can be compiled via
 * `metabase/querying/expressions/compile-expression.ts` and added to the
 * query as a REAL, saveable custom column — the same kind the query
 * builder's own expression editor produces.
 *
 * Only a subset of what the spreadsheet formula engine supports can be
 * expressed this way, because an MBQL custom column is a per-row
 * expression: it can only read other columns *in the same row*. Anything
 * that reaches into a different row (a relative reference whose row
 * differs from the formula's anchor row, or an absolute $-row reference)
 * or summarizes multiple rows (SUM/AVERAGE/COUNT/MIN/MAX) has no per-row
 * equivalent — those would need Metabase's aggregation-mode expressions
 * instead, which collapse rows rather than adding one, so they're a
 * fundamentally different kind of query object and out of scope here.
 */

import { getMBQLName } from "metabase/querying/expressions";

import { type FormulaAstNode, parseFormula } from "./formula-engine";
import type { SpreadsheetField } from "./types";

/** Metabase writes text values with double quotes and backslash escapes. */
function quoteString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Column names containing a bracket have to be escaped inside [ ]. */
function quoteColumn(name: string): string {
  return `[${name.replace(/\\/g, "\\\\").replace(/\]/g, "\\]")}]`;
}

const AGGREGATE_FUNCTION_NAMES = new Set([
  "SUM",
  "AVERAGE",
  "COUNT",
  "MIN",
  "MAX",
]);

export type TranslationResult =
  /** Metabase expression syntax, e.g. "[A] / [B]". */
  | { ok: true; expressionSource: string }
  /** A short, user-facing explanation of why it can't be a column. */
  | { ok: false; reason: string };

function translateNode(
  node: FormulaAstNode,
  anchorRow: number,
  fields: SpreadsheetField[],
  visiting: Set<number>,
): TranslationResult {
  switch (node.type) {
    case "number":
      return { ok: true, expressionSource: String(node.value) };

    case "string":
      return { ok: true, expressionSource: quoteString(node.value) };

    case "boolean":
      return { ok: true, expressionSource: node.value ? "True" : "False" };

    case "columnRef":
      return { ok: true, expressionSource: quoteColumn(node.name) };

    case "not": {
      const operand = translateNode(node.operand, anchorRow, fields, visiting);
      if (!operand.ok) {
        return operand;
      }
      return {
        ok: true,
        expressionSource: `NOT (${operand.expressionSource})`,
      };
    }

    case "cellRef": {
      if (node.absoluteRow || node.row !== anchorRow) {
        return {
          ok: false,
          reason:
            "references a different row — only same-row formulas can be saved as a column",
        };
      }
      const field = fields[node.col];
      if (!field) {
        return { ok: false, reason: "references an empty column" };
      }
      if (field.kind === "source") {
        return { ok: true, expressionSource: `[${field.name}]` };
      }
      // Another formula field: inline its own translation rather than
      // requiring it to already exist as a real saved column.
      if (visiting.has(node.col)) {
        return { ok: false, reason: "has a circular reference" };
      }
      const nested = translateFormulaSource(
        field.formula,
        field.anchorRow,
        fields,
        new Set(visiting).add(node.col),
      );
      if (!nested.ok) {
        return nested;
      }
      return { ok: true, expressionSource: `(${nested.expressionSource})` };
    }

    case "range":
      return {
        ok: false,
        reason:
          "uses a cell range, which needs a summary, not a per-row column",
      };

    case "columnRange":
      return {
        ok: false,
        reason:
          "uses a whole column, which needs a summary, not a per-row column",
      };

    case "unaryMinus": {
      const operand = translateNode(node.operand, anchorRow, fields, visiting);
      if (!operand.ok) {
        return operand;
      }
      return { ok: true, expressionSource: `-(${operand.expressionSource})` };
    }

    case "binary": {
      const left = translateNode(node.left, anchorRow, fields, visiting);
      if (!left.ok) {
        return left;
      }
      const right = translateNode(node.right, anchorRow, fields, visiting);
      if (!right.ok) {
        return right;
      }
      return {
        ok: true,
        expressionSource: `(${left.expressionSource} ${node.op} ${right.expressionSource})`,
      };
    }

    case "call": {
      if (AGGREGATE_FUNCTION_NAMES.has(node.name)) {
        return {
          ok: false,
          reason: `${node.name} summarizes multiple rows, which needs a summary, not a per-row column`,
        };
      }
      // Checked against Metabase's own clause catalog so an unknown name
      // fails here, with the name in the message, rather than surfacing
      // as a confusing parse error from the expression compiler.
      if (!getMBQLName(node.name)) {
        return { ok: false, reason: `unknown function ${node.name}` };
      }
      const args: string[] = [];
      for (const arg of node.args) {
        const translated = translateNode(arg, anchorRow, fields, visiting);
        if (!translated.ok) {
          return translated;
        }
        args.push(translated.expressionSource);
      }
      // Zero-argument clauses (now, today) are spelled bare in Metabase
      // expression syntax; "now()" is not accepted there.
      const lower = node.name.toLowerCase();
      return {
        ok: true,
        expressionSource:
          args.length === 0 ? lower : `${lower}(${args.join(", ")})`,
      };
    }
  }
}

/** Translates a raw formula string (as stored on a formula field) into
 * Metabase expression syntax, or explains why it can't be. */
export function translateFormulaSource(
  formula: string,
  anchorRow: number,
  fields: SpreadsheetField[],
  visiting: Set<number> = new Set(),
): TranslationResult {
  let ast: FormulaAstNode;
  try {
    ast = parseFormula(formula);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "couldn't parse formula",
    };
  }
  return translateNode(ast, anchorRow, fields, visiting);
}
