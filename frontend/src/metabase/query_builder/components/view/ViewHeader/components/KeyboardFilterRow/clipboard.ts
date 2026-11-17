import { isEqual } from "underscore";

import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type { DatabaseId, DimensionReference } from "metabase-types/api";

import {
  type BoolOperator,
  type Token,
  filterToken,
  getFilterLabel,
  opToken,
  removeDanglingTokens,
  toFilterClause,
} from "./tokens";

/**
 * Prototype: the filter bar's tokens on the clipboard. Next to the plain text,
 * which reads like the bar, a structured payload lets another bar rebuild the
 * same tokens: each filter as its expression tree, with every column or segment
 * as a legacy ref that the pasting bar resolves against its own query.
 */
export const FILTER_CLIPBOARD_TYPE = "application/x-metabase-filters";

const PAYLOAD_VERSION = 1;

type ClipboardRef = { ref: DimensionReference };
/** A segment's legacy ref, matched whole against the target's segments. */
type ClipboardSegment = { segment: unknown[] };
type ClipboardBigInt = { bigint: string };

type ClipboardArg =
  | boolean
  | number
  | string
  | ClipboardRef
  | ClipboardSegment
  | ClipboardBigInt
  | ClipboardParts;

type ClipboardParts = {
  operator: string;
  args: ClipboardArg[];
  options: Lib.ExpressionOptions;
};

type ClipboardToken =
  | { type: "filter"; parts: ClipboardParts }
  | { type: "op"; op: BoolOperator }
  | { type: "paren"; side: "open" | "close" };

export type FilterClipboardPayload = {
  version: typeof PAYLOAD_VERSION;
  databaseId: DatabaseId | null;
  tokens: ClipboardToken[];
};

// ---------------------------------------------------------------------------
// Tokens -> clipboard
// ---------------------------------------------------------------------------

export function serializeTokens(
  query: Lib.Query,
  stageIndex: number,
  tokens: readonly Token[],
): FilterClipboardPayload {
  return {
    version: PAYLOAD_VERSION,
    databaseId: Lib.databaseID(query),
    tokens: tokens.map((token) =>
      token.type === "filter"
        ? {
            type: "filter",
            parts: serializeParts(
              query,
              stageIndex,
              Lib.expressionParts(query, stageIndex, token.clause),
            ),
          }
        : token,
    ),
  };
}

function serializeParts(
  query: Lib.Query,
  stageIndex: number,
  parts: Lib.ExpressionParts,
): ClipboardParts {
  return {
    operator: parts.operator,
    args: parts.args.map((arg) => serializeArg(query, stageIndex, arg)),
    options: parts.options,
  };
}

function serializeArg(
  query: Lib.Query,
  stageIndex: number,
  arg: Lib.ExpressionArg | Lib.ExpressionParts,
): ClipboardArg {
  if (typeof arg === "bigint") {
    return { bigint: arg.toString() };
  }
  if (
    typeof arg === "boolean" ||
    typeof arg === "number" ||
    typeof arg === "string"
  ) {
    return arg;
  }
  if (Lib.isSegmentMetadata(arg)) {
    return { segment: Lib.legacyRef(query, stageIndex, arg) };
  }
  if (Lib.isColumnMetadata(arg) || Lib.isMetricMetadata(arg)) {
    return { ref: Lib.legacyRef(query, stageIndex, arg) };
  }
  if (isExpressionParts(arg)) {
    return serializeParts(query, stageIndex, arg);
  }
  // A measure has no legacy ref; nothing on the clipboard can stand for it.
  throw new UnserializableArgError();
}

function isExpressionParts(
  arg: Lib.ExpressionArg | Lib.ExpressionParts,
): arg is Lib.ExpressionParts {
  return typeof arg === "object" && "operator" in arg;
}

class UnserializableArgError extends Error {}

/**
 * The tokens as the bar spells them, for pasting into a text: display names,
 * explicit `and`s and parentheses tight around their groups.
 */
export function getTokensText(
  query: Lib.Query,
  stageIndex: number,
  tokens: readonly Token[],
): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "filter":
          return getFilterLabel(query, stageIndex, token.clause);
        case "op":
          return token.op;
        case "paren":
          return token.side === "open" ? "(" : ")";
      }
    })
    .join(" ")
    .replaceAll("( ", "(")
    .replaceAll(" )", ")");
}

// ---------------------------------------------------------------------------
// Clipboard -> tokens
// ---------------------------------------------------------------------------

/** The payload of a filter-bar copy, or undefined for any other clipboard content. */
export function parseFilterClipboard(
  data: string | null | undefined,
): FilterClipboardPayload | undefined {
  if (!data) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(data);
    return isFilterClipboardPayload(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isFilterClipboardPayload(
  value: unknown,
): value is FilterClipboardPayload {
  return (
    isRecord(value) &&
    value.version === PAYLOAD_VERSION &&
    (value.databaseId === null || typeof value.databaseId === "number") &&
    Array.isArray(value.tokens) &&
    value.tokens.every(isClipboardToken)
  );
}

function isClipboardToken(value: unknown): value is ClipboardToken {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case "filter":
      return isClipboardParts(value.parts);
    case "op":
      return value.op === "and" || value.op === "or";
    case "paren":
      return value.side === "open" || value.side === "close";
    default:
      return false;
  }
}

function isClipboardParts(value: unknown): value is ClipboardParts {
  return (
    isRecord(value) &&
    typeof value.operator === "string" &&
    Array.isArray(value.args) &&
    value.args.every(isClipboardArg) &&
    isRecord(value.options)
  );
}

function isClipboardArg(value: unknown): value is ClipboardArg {
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  if ("ref" in value) {
    return Array.isArray(value.ref) && typeof value.ref[0] === "string";
  }
  if ("segment" in value) {
    return Array.isArray(value.segment);
  }
  if ("bigint" in value) {
    return typeof value.bigint === "string";
  }
  return isClipboardParts(value);
}

export type DeserializeResult =
  | { ok: true; tokens: Token[]; skippedCount: number }
  | { ok: false; reason: "database" };

/**
 * The payload's tokens for this query. A filter whose column or segment the
 * stage does not have is left out, with the connector that would dangle, and
 * counted in `skippedCount`. A payload from another database is refused whole:
 * its field ids mean other columns here.
 */
export function deserializeTokens(
  query: Lib.Query,
  stageIndex: number,
  payload: FilterClipboardPayload,
): DeserializeResult {
  if (payload.databaseId !== Lib.databaseID(query)) {
    return { ok: false, reason: "database" };
  }
  const resolve = createArgResolver(query, stageIndex);
  const tokens = payload.tokens
    .map((token): Token | undefined => {
      if (token.type === "op") {
        return opToken(token.op);
      }
      if (token.type === "paren") {
        return token;
      }
      const clause = rebuildFilter(query, stageIndex, token.parts, resolve);
      return clause == null ? undefined : filterToken(clause);
    })
    .filter(isNotNull);
  const skippedCount = payload.tokens.length - tokens.length;
  // Copied tokens go in as they are; only a skipped filter leaves connectors
  // and parentheses that would dangle.
  return {
    ok: true,
    tokens: skippedCount > 0 ? removeDanglingTokens(tokens) : tokens,
    skippedCount,
  };
}

type ArgResolver = (
  arg: ClipboardArg,
) => Lib.ExpressionArg | Lib.ExpressionParts | undefined;

function createArgResolver(query: Lib.Query, stageIndex: number): ArgResolver {
  const columns = Lib.filterableColumns(query, stageIndex);
  const segments = Lib.availableSegments(query, stageIndex);
  const resolveColumn = (ref: DimensionReference) => {
    const [index] = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      columns,
      [ref],
    );
    return index >= 0 ? columns[index] : undefined;
  };
  const resolveSegment = (ref: unknown[]) =>
    segments.find((segment) =>
      isEqual(Lib.legacyRef(query, stageIndex, segment), ref),
    );
  const resolve: ArgResolver = (arg) => {
    if (typeof arg !== "object") {
      return arg;
    }
    if ("ref" in arg) {
      return resolveColumn(arg.ref);
    }
    if ("segment" in arg) {
      return resolveSegment(arg.segment);
    }
    if ("bigint" in arg) {
      return BigInt(arg.bigint);
    }
    return resolveParts(arg, resolve);
  };
  return resolve;
}

function resolveParts(
  parts: ClipboardParts,
  resolve: ArgResolver,
): Lib.ExpressionParts | undefined {
  const args = parts.args.map(resolve).filter(isNotNull);
  if (args.length < parts.args.length) {
    return undefined;
  }
  return {
    // The operator came from `expressionParts` of a real clause; a payload
    // with an unknown one fails in `toFilterClause` below and is skipped.
    operator: parts.operator as Lib.ExpressionOperator,
    args,
    options: parts.options,
  };
}

function rebuildFilter(
  query: Lib.Query,
  stageIndex: number,
  parts: ClipboardParts,
  resolve: ArgResolver,
): Lib.FilterClause | undefined {
  const resolved = resolveParts(parts, resolve);
  if (resolved == null) {
    return undefined;
  }
  try {
    return toFilterClause(
      query,
      stageIndex,
      Lib.expressionClause(resolved.operator, resolved.args, resolved.options),
    );
  } catch {
    return undefined;
  }
}

/**
 * Both clipboard entries of a copy. Undefined when a token cannot go on the
 * clipboard, so the copy does nothing rather than copying half.
 */
export function getClipboardEntries(
  query: Lib.Query,
  stageIndex: number,
  tokens: readonly Token[],
): Record<string, string> | undefined {
  try {
    return {
      "text/plain": getTokensText(query, stageIndex, tokens),
      [FILTER_CLIPBOARD_TYPE]: JSON.stringify(
        serializeTokens(query, stageIndex, tokens),
      ),
    };
  } catch (error) {
    if (error instanceof UnserializableArgError) {
      return undefined;
    }
    throw error;
  }
}
