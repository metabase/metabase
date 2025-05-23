import * as Lib from "metabase-lib";
import ValidationError from "metabase-lib/v1/ValidationError";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";

import { DiagnosticError } from "../../errors";

const SUPPORTED_MB_FUNCTIONS = ["time_grouping"];

export function checkLibDiagnostics({
  query,
  stageIndex,
  expressionMode,
  expressionClause,
  expressionIndex,
}: {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  expressionClause: Lib.ExpressionClause;
  expressionIndex?: number;
}) {
  const error = Lib.diagnoseExpression(
    query,
    stageIndex,
    expressionMode,
    expressionClause,
    expressionIndex,
  );
  if (error) {
    throw new DiagnosticError(error.message, {
      friendly: Boolean(error.friendly),
    });
  }
}

function extractTimeGroupingParams(queryText: string): Set<string> {
  const regex = /\{\{\s*mb\.time_grouping\(\s*["']([^"']+)["']/g;
  const params = new Set<string>();
  let match;
  while ((match = regex.exec(queryText)) !== null) {
    params.add(match[1]);
  }
  return params;
}

function extractTemplateTagParams(queryText: string): Set<string> {
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const params = new Set<string>();
  let match;
  while ((match = regex.exec(queryText)) !== null) {
    if (!SUPPORTED_MB_FUNCTIONS.map((fn) => `mb.${fn}`).includes(match[1])) {
      params.add(match[1]);
    }
  }
  return params;
}

function extractMbFunctionUsages(queryText: string): string[] {
  const regex = /\{\{\s*mb\.([a-zA-Z0-9_]+)\s*\(/g;
  const found: string[] = [];
  let match;
  while ((match = regex.exec(queryText)) !== null) {
    if (!SUPPORTED_MB_FUNCTIONS.includes(match[1])) {
      found.push(match[1]);
    }
  }
  return found;
}

export function checkNativeQueryDiagnostics(nativeQuery: NativeQuery) {
  const queryText = nativeQuery.queryText();

  const mbFunctions = extractMbFunctionUsages(queryText);
  if (mbFunctions.length > 0) {
    throw new ValidationError(
      `Unsupported mb. function(s) used: ${mbFunctions.join(", ")}. Only mb.${SUPPORTED_MB_FUNCTIONS.join(", mb.")} ${SUPPORTED_MB_FUNCTIONS.length > 1 ? "are" : "is"} allowed.`,
    );
  }

  // Strictly check for mb.time_grouping usage as a function call with exactly two string arguments
  const allMbTimeGroupingMatches = Array.from(
    queryText.matchAll(/\{\{\s*mb\.time_grouping\(([^)]*)\)\s*\}\}/gi),
  );
  for (const match of allMbTimeGroupingMatches) {
    const args = match[1].split(",").map((arg) => arg.trim());
    if (args.length !== 2) {
      throw new ValidationError(
        `mb.time_grouping must have exactly two arguments (both strings in quotes).`,
      );
    }
    for (let i = 0; i < 2; i++) {
      if (!/^['"][^'"]+['"]$/.test(args[i])) {
        throw new ValidationError(
          `Argument ${i + 1} of mb.time_grouping must be a string in quotes. Found: ${args[i]}`,
        );
      }
    }
  }

  // Check for any mb.time_grouping usage that is not a function call (e.g., as a variable)
  const nonFunctionMbTimeGrouping = Array.from(
    queryText.matchAll(/\{\{\s*mb\.time_grouping\s*\}\}/gi),
  );
  if (nonFunctionMbTimeGrouping.length > 0) {
    throw new ValidationError(
      `mb.time_grouping must be used as a function call, e.g., mb.time_grouping("arg1", "arg2")`,
    );
  }

  // Check for incomplete mb.time_grouping usages (e.g., missing closing parenthesis or braces)
  const mbTimeGroupingPattern = /\{\{\s*mb\.time_grouping/g;
  let match;
  while ((match = mbTimeGroupingPattern.exec(queryText)) !== null) {
    // Check if this match is part of a valid function call
    const rest = queryText.slice(match.index);
    if (!/^\{\{\s*mb\.time_grouping\(([^)]*)\)\s*\}\}/.test(rest)) {
      throw new ValidationError(
        `mb.time_grouping must be used as a function call, e.g., mb.time_grouping("arg1", "arg2")`,
      );
    }
  }

  const timeGroupingParams = extractTimeGroupingParams(queryText);
  const templateTagParams = extractTemplateTagParams(queryText);

  for (const param of timeGroupingParams) {
    if (templateTagParams.has(param)) {
      throw new ValidationError(
        `Parameter "${param}" is used as both a time grouping and a variable. This is not allowed.`,
      );
    }

    const tag = nativeQuery.templateTagsMap()[param];
    if (tag && tag.type && tag.type !== "temporal-unit") {
      throw new ValidationError(
        `Parameter "${param}" is used as a time grouping and as a parameter of type "${tag.type}". This is not allowed.`,
      );
    }
  }

  return true;
}
