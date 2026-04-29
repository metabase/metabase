import { match } from "ts-pattern";
import { t } from "ttag";

import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import { MATH_OPERATORS, isMathOperator } from "metabase-types/api";

import type {
  ExpressionDefinitionEntry,
  ExpressionSubToken,
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerFormulaEntity,
} from "../../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../../types/viewer-state";
import { stampMetricCounts } from "../../utils/expression";

export type MetricNameMap = Partial<Record<MetricSourceId, string>>;

/**
 * Returns an array of human-readable expression strings interleaved with numbers
 * identifying when metrics are used multiple times in the expression.
 */
export function buildExpressionForPill(
  tokens: ExpressionSubToken[],
  metricNames: MetricNameMap,
): (string | number)[] {
  const result: (string | number)[] = [];
  let curr = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = tokens[i - 1];
    const needsSpace =
      i > 0 && prev?.type !== "open-paren" && token.type !== "close-paren";
    if (needsSpace) {
      curr += " ";
    }
    if (token.type === "open-paren") {
      curr += "(";
    } else if (token.type === "close-paren") {
      curr += ")";
    } else if (token.type === "operator") {
      curr += token.op;
    } else if (token.type === "metric") {
      const name = metricNames[token.sourceId];
      curr += name ?? "";
      if (token.count > 1) {
        result.push(curr);
        curr = "";
        result.push(token.count);
      }
    } else if (token.type === "constant") {
      curr += String(token.value);
    }
  }
  result.push(curr);
  return result;
}

/**
 * Builds a human-readable expression string from a single expression's sub-tokens
 */
export function buildExpressionText(
  tokens: ExpressionSubToken[],
  metricNames: MetricNameMap,
): string {
  return buildExpressionForPill(tokens, metricNames)
    .filter((x) => typeof x === "string")
    .join("");
}

export const ENTITY_SEPARATOR = ", ";

export interface FullTextWithIdentities {
  text: string;
  identities: MetricIdentityEntry[];
}

/**
 * Produces the display text and metric identity entries in a single walk.
 * Identities carry the exact character offsets matching the text layout.
 */
export function buildFullTextWithIdentities(
  formulaEntities: MetricsViewerFormulaEntity[],
  metricNames: MetricNameMap,
): FullTextWithIdentities {
  const identities: MetricIdentityEntry[] = [];
  const parts: string[] = [];
  let offset = 0;
  let slotIndex = 0;

  for (const entity of formulaEntities) {
    if (parts.length > 0) {
      parts.push(ENTITY_SEPARATOR);
      offset += ENTITY_SEPARATOR.length;
    }

    if (isMetricEntry(entity)) {
      const name = metricNames[entity.id] ?? "";
      identities.push({
        sourceId: entity.id,
        from: offset,
        to: offset + name.length,
        definition: entity.definition,
        slotIndex: slotIndex++,
      });
      parts.push(name);
      offset += name.length;
      continue;
    }

    if (isExpressionEntry(entity)) {
      const defaultText = buildExpressionText(entity.tokens, metricNames);
      const customName =
        entity.name && entity.name !== defaultText ? entity.name : undefined;

      for (
        let tokenIndex = 0;
        tokenIndex < entity.tokens.length;
        tokenIndex++
      ) {
        const token = entity.tokens[tokenIndex];
        const prev = entity.tokens[tokenIndex - 1];
        if (
          tokenIndex > 0 &&
          prev?.type !== "open-paren" &&
          token.type !== "close-paren"
        ) {
          parts.push(" ");
          offset += 1;
        }

        const fragment = getTokenFragment(token, metricNames);
        if (token.type === "metric") {
          identities.push({
            sourceId: token.sourceId,
            from: offset,
            to: offset + fragment.length,
            definition: token.definition ?? null,
            slotIndex: slotIndex++,
            customName,
          });
        }
        parts.push(fragment);
        offset += fragment.length;
      }
      continue;
    }

    parts.push("");
  }

  return { text: parts.join(""), identities };
}

function getTokenFragment(
  token: ExpressionSubToken,
  metricNames: MetricNameMap,
): string {
  return match(token)
    .with({ type: "metric" }, (t) => metricNames[t.sourceId] ?? "")
    .with({ type: "operator" }, (t) => t.op)
    .with({ type: "constant" }, (t) => String(t.value))
    .with({ type: "open-paren" }, () => "(")
    .with({ type: "close-paren" }, () => ")")
    .exhaustive();
}

const COMMA = ",";

const PAREN_DELIMITERS = ["(", ")"] as const;
const NON_COMMA_DELIMITERS = new Set<string>([
  ...MATH_OPERATORS,
  ...PAREN_DELIMITERS,
]);
const EXPRESSION_DELIMITERS = new Set<string>([...NON_COMMA_DELIMITERS, COMMA]);

/** Returns true for characters that form word continuations (letters, digits, underscore). */
function isWordChar(ch: string): boolean {
  return /\w/.test(ch);
}

function isWordDelimiter(ch: string): boolean {
  return EXPRESSION_DELIMITERS.has(ch) || /\s/.test(ch);
}

/**
 * Extracts the "word" (potential metric name) at the given cursor position
 */
export function getWordAtCursor(
  text: string,
  cursorPos: number,
  metricNames: MetricNameMap,
  identities: MetricIdentityEntry[],
): { word: string; start: number; end: number } {
  const metricNamesLower = new Set(
    Object.values(metricNames)
      .map((name) => name?.toLowerCase() ?? "")
      .filter((n) => n.length > 0),
  );

  const isMetricNamePrefix = (s: string) => {
    const sLower = s.toLowerCase();
    for (const metricName of metricNamesLower) {
      if (metricName.startsWith(sLower)) {
        return true;
      }
    }
    return false;
  };

  const leftBoundary = identities.reduce(
    (left, identity) =>
      identity.to <= cursorPos ? Math.max(left, identity.to) : left,
    0,
  );
  const rightBoundary = identities.reduce(
    (right, identity) =>
      identity.from >= cursorPos ? Math.min(right, identity.from) : right,
    text.length,
  );
  let start = cursorPos;
  let end = cursorPos;
  // we can only split on delimiters or whitespace, so first extend start and end until we hit a delimiter or whitespace
  for (let i = cursorPos - 1; i >= leftBoundary; i--) {
    if (isWordDelimiter(text[i])) {
      break;
    }
    start = i;
  }
  for (let i = cursorPos; i < rightBoundary; i++) {
    if (isWordDelimiter(text[i])) {
      break;
    }
    end = i + 1;
  }
  // now we can extend across a delimiter or whitespace if we find a metric name prefix
  for (let i = start - 1; i >= leftBoundary; i--) {
    if (isMetricNamePrefix(text.slice(i, end))) {
      start = i;
    }
  }
  for (let i = end + 1; i <= rightBoundary; i++) {
    if (isMetricNamePrefix(text.slice(start, i))) {
      end = i;
    } else {
      break;
    }
  }

  if (start < end) {
    return {
      word: text.slice(start, end),
      start,
      end,
    };
  }

  // didn't find any prefixes, fallback to simple delimiter approach
  for (let i = cursorPos - 1; i >= leftBoundary; i--) {
    if (EXPRESSION_DELIMITERS.has(text[i])) {
      break;
    }
    start = i;
  }
  for (let i = cursorPos + 1; i <= rightBoundary; i++) {
    if (EXPRESSION_DELIMITERS.has(text[i])) {
      break;
    }
    end = i;
  }

  const raw = text.slice(start, end);
  const trimmed = raw.trim();
  // special case for all whitespace
  // trimStart and trimEnd would both count the spaces, causing start > end, which causes an error
  if (trimmed.length === 0) {
    return { word: "", start: cursorPos, end: cursorPos };
  }
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  return {
    word: trimmed,
    start: start + leading,
    end: end - trailing,
  };
}

/**
 * Returns positions of commas in the text that are NOT inside a metric token.
 * These are the real item separators. Metric names may contain commas (e.g.
 * "Revenue, Total") — those commas are consumed by the greedy metric matcher
 * in `parseFullTextWithPositions` and must not be treated as separators.
 */
function findSeparatorCommaPositions(
  text: string,
  allTokens: PositionedToken[],
): number[] {
  const metricRanges = allTokens.filter((t) => t.type === "metric");
  const commas: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const isComma = text[i] === COMMA;
    const isInsideMetricToken = metricRanges.some(
      (r) => i >= r.from && i < r.to,
    );
    if (isComma && !isInsideMetricToken) {
      commas.push(i);
    }
  }
  return commas;
}

/**
 * Groups an array of positioned tokens into segments split by separator commas.
 */
function groupTokensBySegment(
  allTokens: PositionedToken[],
  separatorPositions: number[],
): PositionedToken[][] {
  const segments: PositionedToken[][] = [];
  let current: PositionedToken[] = [];
  let commaIdx = 0;

  for (const token of allTokens) {
    while (
      commaIdx < separatorPositions.length &&
      token.from > separatorPositions[commaIdx]
    ) {
      segments.push(current);
      current = [];
      commaIdx++;
    }
    current.push(token);
  }
  segments.push(current);
  return segments;
}

type MetricPositionedToken = PositionedToken & { type: "metric" };

type MetricSubToken = Extract<ExpressionSubToken, { type: "metric" }>;

export type MetricTokenVisit =
  | {
      kind: "standalone";
      positioned: MetricPositionedToken;
      entity: MetricDefinitionEntry;
    }
  | {
      kind: "expression";
      positioned: MetricPositionedToken;
      entity: ExpressionDefinitionEntry;
      exprToken: MetricSubToken;
      exprTokenIndex: number;
    };

/**
 * Parses text into segments aligned with entities, then calls `visitor`
 * for each metric token with its positioned counterpart and parent entity.
 */
export function traverseMetricTokens(
  text: string,
  metricNames: MetricNameMap,
  entities: MetricsViewerFormulaEntity[],
  visitor: (visit: MetricTokenVisit) => void,
  identities: MetricIdentityEntry[],
): void {
  const allTokens = parseFullTextWithPositions(text, metricNames, identities);
  const separators = findSeparatorCommaPositions(text, allTokens);
  const segments = groupTokensBySegment(allTokens, separators);

  let entityIndex = 0;
  for (const segmentTokens of segments) {
    if (segmentTokens.length === 0) {
      continue;
    }

    const entity = entities[entityIndex++];
    if (!entity) {
      continue;
    }

    const metricTokens = segmentTokens.filter(
      (token): token is MetricPositionedToken => token.type === "metric",
    );

    if (isMetricEntry(entity)) {
      const positioned = metricTokens[0];
      if (!positioned) {
        continue;
      }
      visitor({ kind: "standalone", positioned, entity });
      continue;
    }

    if (!isExpressionEntry(entity)) {
      continue;
    }

    let metricIdx = 0;
    for (let tokenIndex = 0; tokenIndex < entity.tokens.length; tokenIndex++) {
      const exprToken = entity.tokens[tokenIndex];
      if (exprToken.type !== "metric") {
        continue;
      }
      const positioned = metricTokens[metricIdx++];
      if (!positioned) {
        continue;
      }
      visitor({
        kind: "expression",
        positioned,
        entity,
        exprToken,
        exprTokenIndex: tokenIndex,
      });
    }
  }
}

/** Strip position info from a positioned token, dropping unknown tokens. */
function stripPositions(token: PositionedToken): ExpressionSubToken | null {
  switch (token.type) {
    case "metric":
      return { type: "metric", sourceId: token.sourceId, count: 0 };
    case "operator":
      return { type: "operator", op: token.op };
    case "constant":
      return { type: "constant", value: token.value };
    case "open-paren":
      return { type: "open-paren" };
    case "close-paren":
      return { type: "close-paren" };
    case "unknown":
      return null;
  }
}

/**
 * Parses a full expression text (with ", " separating items) into a
 * `MetricsViewerFormulaEntity[]`. Each comma-separated segment becomes
 * either a standalone metric entry (if it matches a single metric name) or
 * an expression entry (if it contains operators / multiple operands).
 *
 * Metric names are matched greedily, longest first, so names containing
 * operators (e.g. "Year-to-Date") or commas (e.g. "Revenue, Total") are
 * handled correctly — metrics are identified before commas are used as
 * separators.
 */
export function parseFullText(
  text: string,
  metricNames: MetricNameMap,
  identities: MetricIdentityEntry[],
): MetricsViewerFormulaEntity[] {
  const allTokens = parseFullTextWithPositions(text, metricNames, identities);
  const separators = findSeparatorCommaPositions(text, allTokens);
  const segments = groupTokensBySegment(allTokens, separators);
  const result: MetricsViewerFormulaEntity[] = [];

  for (const segmentTokens of segments) {
    if (segmentTokens.length === 0) {
      continue;
    }

    const subTokens = stampMetricCounts(
      segmentTokens
        .map(stripPositions)
        .filter((t): t is ExpressionSubToken => t !== null),
    );

    const firstToken = subTokens[0];
    if (subTokens.length === 1 && firstToken.type === "metric") {
      const name = metricNames[firstToken.sourceId];
      if (name) {
        result.push({
          id: firstToken.sourceId,
          type: "metric",
          definition: null,
        });
        continue;
      }
    }

    const name = buildExpressionText(subTokens, metricNames);
    result.push({
      id: `expression:${name}`,
      type: "expression",
      name,
      tokens: subTokens,
    });
  }

  return result;
}

/**
 * Removes unmatched parentheses from a sub-token stream.
 */
export function removeUnmatchedParens(
  tokens: ExpressionSubToken[],
): ExpressionSubToken[] {
  const openStack: number[] = [];
  const matchedIndices = new Set<number>();

  tokens.forEach((token, i) => {
    if (token.type === "open-paren") {
      openStack.push(i);
    } else if (token.type === "close-paren") {
      if (openStack.length > 0) {
        matchedIndices.add(openStack.pop()!);
        matchedIndices.add(i);
      }
    }
  });

  const hasDangling = tokens.some(
    (token, i) =>
      (token.type === "open-paren" || token.type === "close-paren") &&
      !matchedIndices.has(i),
  );

  if (!hasDangling) {
    return tokens;
  }

  return tokens.filter((token, i) =>
    token.type !== "open-paren" && token.type !== "close-paren"
      ? true
      : matchedIndices.has(i),
  );
}

/**
 * Removes unnecessary parentheses from a sub-token stream.
 * Parens are unnecessary when they contain 0 or 1 operand tokens.
 */
export function cleanupParens(
  tokens: ExpressionSubToken[],
): ExpressionSubToken[] {
  let current = tokens;
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < current.length; i++) {
      if (current[i].type !== "open-paren") {
        continue;
      }

      let depth = 1;
      let j = i + 1;
      while (j < current.length && depth > 0) {
        if (current[j].type === "open-paren") {
          depth++;
        } else if (current[j].type === "close-paren") {
          depth--;
        }
        j++;
      }

      if (depth !== 0) {
        continue;
      }

      const closeIdx = j - 1;
      const content = current.slice(i + 1, closeIdx);
      const operandCount = content.filter(
        (tok) => tok.type === "metric" || tok.type === "constant",
      ).length;

      if (operandCount <= 1) {
        current = [
          ...current.slice(0, i),
          ...content,
          ...current.slice(closeIdx + 1),
        ];
        changed = true;
        break;
      }
    }
  }

  return current;
}

// ── Positioned token type (internal) ────────────────────────────────────────

export type PositionedToken = (
  | ExpressionSubToken
  | { type: "unknown"; text: string }
) & { from: number; to: number };

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function skipDigits(text: string, index: number): number {
  while (index < text.length && isDigit(text[index])) {
    index++;
  }
  return index;
}

function consumeNumber(text: string, startIndex: number): number | null {
  let index = startIndex;

  const startsWithDot = text[index] === "." && isDigit(text[index + 1]);
  if (!startsWithDot && !isDigit(text[index])) {
    return null;
  }

  index = skipDigits(text, index);

  if (text[index] === "." && isDigit(text[index + 1])) {
    index = skipDigits(text, index + 1);
  }

  return index;
}

/** Same as the main parser but records character positions for each token. */
export function parseFullTextWithPositions(
  text: string,
  metricNames: MetricNameMap,
  identities: MetricIdentityEntry[],
): PositionedToken[] {
  const sortedMetrics = Object.entries(metricNames)
    .map(([id, name]) => ({ id, name: (name ?? "").toLowerCase() }))
    .filter(
      (m): m is { id: MetricSourceId; name: string } =>
        (m.name?.length ?? 0) > 0,
    )
    .sort((a, b) => b.name.length - a.name.length);

  const identityByStart = new Map<number, MetricIdentityEntry>();
  for (const identity of identities) {
    identityByStart.set(identity.from, identity);
  }

  const lower = text.toLowerCase();
  const tokens: PositionedToken[] = [];
  let i = 0;

  while (i < text.length) {
    const identity = identityByStart.get(i);
    if (identity) {
      tokens.push({
        type: "metric",
        sourceId: identity.sourceId,
        count: 0,
        from: identity.from,
        to: identity.to,
      });
      i = identity.to;
      continue;
    }

    const ch = text[i];

    const isWhitespace = ch === " " || ch === "\t";
    if (isWhitespace) {
      i++;
      continue;
    }

    // Commas are item separators — tracked for position-based splitting
    // but NOT emitted as a token type (no more "separator" tokens).
    if (ch === COMMA) {
      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "open-paren", from: i, to: i + 1 });
      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({ type: "close-paren", from: i, to: i + 1 });
      i++;
      continue;
    }

    if (isMathOperator(ch)) {
      const lastToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;
      const isUnaryContext =
        lastToken === null ||
        lastToken.type === "operator" ||
        lastToken.type === "open-paren";

      if (ch === "-" && isUnaryContext) {
        const endIndex = consumeNumber(text, i + 1);
        if (endIndex !== null) {
          tokens.push({
            type: "constant",
            value: parseFloat(text.slice(i, endIndex)),
            from: i,
            to: endIndex,
          });
          i = endIndex;
          continue;
        }
      }

      tokens.push({
        type: "operator",
        op: ch,
        from: i,
        to: i + 1,
      });
      i++;
      continue;
    }

    const isNumberStart = isDigit(ch) || (ch === "." && isDigit(text[i + 1]));
    if (isNumberStart) {
      const endIndex = consumeNumber(text, i)!;
      tokens.push({
        type: "constant",
        value: parseFloat(text.slice(i, endIndex)),
        from: i,
        to: endIndex,
      });
      i = endIndex;
      continue;
    }

    let matched = false;
    for (const { name, id } of sortedMetrics) {
      if (lower.startsWith(name, i)) {
        const nextI = i + name.length;
        const nextCh = text[nextI];
        // Accept the match unless the next character continues an
        // alphanumeric word (e.g. "Revenue" inside "Revenues").
        const isWordBoundary =
          !nextCh || !isWordChar(nextCh) || !isWordChar(name[name.length - 1]);
        if (isWordBoundary) {
          tokens.push({
            type: "metric",
            sourceId: id,
            count: 0,
            from: i,
            to: nextI,
          });
          i = nextI;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // Collect consecutive unrecognized characters into a single unknown token
      const start = i;
      i++;
      while (i < text.length) {
        const char = text[i];
        const isTokenBoundary =
          EXPRESSION_DELIMITERS.has(char) || char === " " || isDigit(char);
        if (isTokenBoundary) {
          break;
        }
        // Check if a metric name starts here — if so, stop the unknown span
        let metricStartsHere = false;
        for (const { name } of sortedMetrics) {
          if (lower.startsWith(name, i)) {
            const nameEndIndex = i + name.length;
            const afterNameChar = text[nameEndIndex];
            const isMetricBoundary =
              !afterNameChar ||
              afterNameChar === " " ||
              EXPRESSION_DELIMITERS.has(afterNameChar);
            if (isMetricBoundary) {
              metricStartsHere = true;
              break;
            }
          }
        }
        if (metricStartsHere) {
          break;
        }
        i++;
      }
      tokens.push({
        type: "unknown",
        text: text.slice(start, i),
        from: start,
        to: i,
      });
    }
  }

  return tokens;
}

export type ErrorRange = { from: number; to: number; message: string };

/**
 * Returns character ranges of invalid tokens in the expression text, each
 * annotated with an error message. Used to apply red-underline decorations
 * and hover tooltips in the CodeMirror editor.
 *
 * Splits by comma to validate each item independently.
 */
export function findInvalidRanges(
  text: string,
  metricNames: MetricNameMap,
  identities: MetricIdentityEntry[],
): ErrorRange[] {
  const allTokens = parseFullTextWithPositions(text, metricNames, identities);
  const separators = findSeparatorCommaPositions(text, allTokens);
  const segments = groupTokensBySegment(allTokens, separators);

  const identityPositions = new Set(
    identities.map((id) => getPositionKey(id.from, id.to)),
  );

  const invalid: ErrorRange[] = [];

  for (const itemTokens of segments) {
    if (itemTokens.length === 0) {
      continue;
    }

    const itemInvalid: ErrorRange[] = [];

    // Unmatched parentheses
    const openStack: PositionedToken[] = [];
    for (const token of itemTokens) {
      if (token.type === "open-paren") {
        openStack.push(token);
      } else if (token.type === "close-paren") {
        if (openStack.length === 0) {
          itemInvalid.push({
            from: token.from,
            to: token.to,
            message: t`Unmatched closing parenthesis`,
          });
        } else {
          openStack.pop();
        }
      }
    }
    for (const token of openStack) {
      itemInvalid.push({
        from: token.from,
        to: token.to,
        message: t`Unmatched opening parenthesis`,
      });
    }

    // Token predecessor validity
    let prevSignificant: PositionedToken | null = null;
    for (const token of itemTokens) {
      if (token.type === "unknown") {
        prevSignificant = token;
        continue;
      }

      const prevType = prevSignificant?.type ?? null;

      if (
        token.type === "metric" ||
        token.type === "constant" ||
        token.type === "open-paren"
      ) {
        if (
          prevType !== null &&
          prevType !== "open-paren" &&
          prevType !== "operator" &&
          prevType !== "unknown"
        ) {
          itemInvalid.push({
            from: token.from,
            to: token.to,
            message: t`Missing operator`,
          });
        }
      } else if (token.type === "operator") {
        if (
          prevType !== "metric" &&
          prevType !== "constant" &&
          prevType !== "close-paren" &&
          prevType !== "unknown"
        ) {
          itemInvalid.push({
            from: token.from,
            to: token.to,
            message: t`Missing operand`,
          });
        }
      } else if (token.type === "close-paren") {
        if (
          prevType !== "metric" &&
          prevType !== "constant" &&
          prevType !== "close-paren" &&
          prevType !== "unknown"
        ) {
          itemInvalid.push({
            from:
              prevType === "open-paren"
                ? (prevSignificant?.from ?? token.from)
                : token.from,
            to: token.to,
            message:
              prevType === "open-paren"
                ? t`Empty parentheses`
                : t`Missing operand before closing parenthesis`,
          });
        }
      }
      prevSignificant = token;
    }

    if (prevSignificant?.type === "operator") {
      itemInvalid.push({
        from: prevSignificant.from,
        to: prevSignificant.to,
        message: t`Expression cannot end with an operator`,
      });
    }

    for (const token of itemTokens) {
      if (token.type === "unknown") {
        itemInvalid.push({
          from: token.from,
          to: token.to,
          message: t`Unknown token: "${token.text}"`,
        });
      }
    }

    // Metric tokens matched by greedy name matching but without a tracked
    // identity (i.e. not selected from the dropdown) must be rejected —
    // they lack the definition needed for dimension assignment.
    // Skip when the identities list is completely empty — this means identity
    // tracking is unavailable (e.g. full doc replacement wiped the RangeSet).
    if (identityPositions.size > 0) {
      for (const token of itemTokens) {
        if (
          token.type === "metric" &&
          !identityPositions.has(getPositionKey(token.from, token.to))
        ) {
          const metricText = text.substring(token.from, token.to);
          itemInvalid.push({
            from: token.from,
            to: token.to,
            message: t`Unknown token: "${metricText}"`,
          });
        }
      }
    }

    const hasMetric = itemTokens.some((tok) => tok.type === "metric");
    if (!hasMetric && itemInvalid.length === 0) {
      itemInvalid.push({
        from: itemTokens[0].from,
        to: itemTokens[itemTokens.length - 1].to,
        message: t`Expression must contain at least one metric`,
      });
    }

    invalid.push(...itemInvalid);
  }

  return invalid;
}

export type MetricIdentityEntry = {
  sourceId: MetricSourceId;
  from: number;
  to: number;
  definition: MetricDefinition | null;
  slotIndex?: number;
  customName?: string;
};

export function stripDefinitionProjections(
  definition: MetricDefinition,
): MetricDefinition {
  const projections = LibMetric.projections(definition);
  if (projections.length === 0) {
    return definition;
  }
  return projections.reduce(
    (def, projection) => LibMetric.removeClause(def, projection),
    definition,
  );
}

const getPositionKey = (from: number, to: number) => `${from}:${to}`;

export interface ApplyTrackedDefinitionsResult {
  entities: MetricsViewerFormulaEntity[];
  /** Maps old slot index → new slot index for matched metric tokens. */
  slotMapping: Map<number, number>;
}

export function applyTrackedDefinitions(
  newEntities: MetricsViewerFormulaEntity[],
  trackedIdentities: MetricIdentityEntry[],
  text: string,
  metricNames: MetricNameMap,
): ApplyTrackedDefinitionsResult {
  const identityByPosition = new Map<
    string,
    {
      definition: MetricDefinition | null;
      slotIndex: number | undefined;
      customName: string | undefined;
    }
  >();
  for (const identity of trackedIdentities) {
    identityByPosition.set(getPositionKey(identity.from, identity.to), {
      definition: identity.definition,
      slotIndex: identity.slotIndex,
      customName: identity.customName,
    });
  }

  const metricOverrides = new Map<
    MetricsViewerFormulaEntity,
    MetricDefinition | null
  >();
  const exprTokenOverrides = new Map<
    MetricsViewerFormulaEntity,
    Map<number, MetricDefinition | undefined>
  >();
  const exprCustomNamesMap = new Map<MetricsViewerFormulaEntity, string>();
  const slotMapping = new Map<number, number>();
  let newSlotCounter = 0;

  traverseMetricTokens(
    text,
    metricNames,
    newEntities,
    (visit) => {
      const newSlotIndex = newSlotCounter++;
      const key = getPositionKey(visit.positioned.from, visit.positioned.to);
      const tracked = identityByPosition.get(key);
      if (!tracked) {
        return;
      }

      if (tracked.slotIndex != null) {
        slotMapping.set(tracked.slotIndex, newSlotIndex);
      }

      if (visit.kind === "standalone") {
        metricOverrides.set(visit.entity, tracked.definition ?? null);
        return;
      }

      let tokenMap = exprTokenOverrides.get(visit.entity);
      if (!tokenMap) {
        tokenMap = new Map();
        exprTokenOverrides.set(visit.entity, tokenMap);
      }
      // remove any existing breakouts - not supported in math expressions
      const definition =
        tracked.definition != null
          ? stripDefinitionProjections(tracked.definition)
          : undefined;
      tokenMap.set(visit.exprTokenIndex, definition);

      // First surviving identity with a custom name wins. If identities
      // from two named expressions merge into one, the earliest (by token
      // order) name is kept — acceptable per the design.
      if (tracked.customName && !exprCustomNamesMap.has(visit.entity)) {
        exprCustomNamesMap.set(visit.entity, tracked.customName);
      }
    },
    trackedIdentities,
  );

  const entities = newEntities.map((entity) => {
    if (metricOverrides.has(entity)) {
      return { ...entity, definition: metricOverrides.get(entity) ?? null };
    }

    if (isExpressionEntry(entity)) {
      const tokenMap = exprTokenOverrides.get(entity);
      const newTokens = tokenMap
        ? entity.tokens.map((token, index) => {
            if (!tokenMap.has(index)) {
              return token;
            }
            return { ...token, definition: tokenMap.get(index) };
          })
        : entity.tokens;
      const tokensChanged = newTokens.some(
        (token, index) => token !== entity.tokens[index],
      );
      const inheritedName = exprCustomNamesMap.get(entity);
      const nameChanged =
        inheritedName != null && inheritedName !== entity.name;
      if (!tokensChanged && !nameChanged) {
        return entity;
      }
      return {
        ...entity,
        tokens: newTokens,
        ...(nameChanged ? { name: inheritedName } : {}),
      };
    }

    return entity;
  });

  return { entities, slotMapping };
}
