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

/**
 * Extracts the "word" (potential metric name) at the given cursor position,
 * using expression delimiters as boundaries.
 *
 * Spaces are NOT delimiters so that multi-word metric names like "Page Views"
 * are returned as a single word. Surrounding whitespace is trimmed.
 *
 * When `metricEntries` is provided, commas are only treated as delimiters
 * when they are real item separators — i.e. the text before the comma forms
 * a complete token (known metric, number, or closing paren). This allows
 * metric names containing commas (e.g. "Revenue, Total") to be typed and
 * searched as a single word.
 */
export function getWordAtCursor(
  text: string,
  cursorPos: number,
  metricNames: MetricNameMap,
): { word: string; start: number; end: number } {
  // Build a set of metric names (lowercased) for quick lookup.
  let metricNamesLower: Set<string> | null = null;
  if (metricNames && Object.values(metricNames).length > 0) {
    metricNamesLower = new Set(
      Object.values(metricNames)
        .map((name) => name?.toLowerCase() ?? "")
        .filter((n) => n.length > 0),
    );
  }

  /**
   * Decides whether the comma at `pos` is a separator (delimiter) rather
   * than part of a metric name being typed.
   *
   * A comma is a separator when the trimmed text before it ends with:
   *  - a known metric name,
   *  - a numeric constant, or
   *  - a closing parenthesis.
   *
   * Otherwise the comma is likely inside a metric name the user is still
   * typing (e.g. "Revenue," as part of "Revenue, Total").
   */
  const isCommaASeparator = (commaPos: number): boolean => {
    if (!metricNamesLower) {
      return true; // no entries → fall back to always splitting on commas
    }

    const before = text.slice(0, commaPos).trimEnd();
    if (before.length === 0) {
      return true;
    }

    const lastCh = before[before.length - 1];
    // After a closing paren → separator
    if (lastCh === ")") {
      return true;
    }
    // After a digit → separator (number constant)
    if (/\d/.test(lastCh)) {
      return true;
    }
    // Check if `before` ends with a known metric name
    const beforeLower = before.toLowerCase();
    for (const name of metricNamesLower) {
      const charBeforeName = before[before.length - name.length - 1];
      const isAtTextStart = before.length === name.length;
      const hasDelimiterBefore =
        NON_COMMA_DELIMITERS.has(charBeforeName) ||
        charBeforeName === COMMA ||
        charBeforeName === " ";
      const endsWithMetricName =
        beforeLower.endsWith(name) && (isAtTextStart || hasDelimiterBefore);
      if (endsWithMetricName) {
        return true;
      }
    }
    return false;
  };

  const isDelimiter = (pos: number): boolean => {
    const ch = text[pos];
    if (NON_COMMA_DELIMITERS.has(ch)) {
      return true;
    }
    if (ch === COMMA) {
      return isCommaASeparator(pos);
    }
    return false;
  };

  let start = cursorPos;
  while (start > 0 && !isDelimiter(start - 1)) {
    start--;
  }

  let end = cursorPos;
  while (end < text.length && !isDelimiter(end)) {
    end++;
  }

  const rawWord = text.slice(start, end);
  const trimmedWord = rawWord.trim();
  const leadingSpaces = rawWord.length - rawWord.trimStart().length;

  return {
    word: trimmedWord,
    start: start + leadingSpaces,
    end: start + leadingSpaces + trimmedWord.length,
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

export type ExcludeMetric = {
  id: number;
  sourceType: "metric" | "measure";
};

type SearchResultLike = {
  id: number;
  model: "metric" | "measure";
};

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
          itemInvalid.push({
            from: token.from,
            to: token.to,
            message: t`Select this metric from the dropdown`,
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

export function filterSearchResults<T extends SearchResultLike>(
  results: T[],
  selectedMetricIds?: Set<number>,
  selectedMeasureIds?: Set<number>,
  excludeMetric?: ExcludeMetric,
): T[] {
  return results.filter((result) => {
    const isAlreadySelected =
      result.model === "metric"
        ? selectedMetricIds?.has(result.id)
        : selectedMeasureIds?.has(result.id);
    const isExcluded =
      excludeMetric &&
      result.id === excludeMetric.id &&
      result.model === excludeMetric.sourceType;
    return !isAlreadySelected && !isExcluded;
  });
}

export type MetricIdentityEntry = {
  sourceId: MetricSourceId;
  from: number;
  to: number;
  definition: MetricDefinition | null;
  slotIndex: number;
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
    { definition: MetricDefinition | null; slotIndex: number }
  >();
  for (const identity of trackedIdentities) {
    identityByPosition.set(getPositionKey(identity.from, identity.to), {
      definition: identity.definition,
      slotIndex: identity.slotIndex,
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

      if (tracked) {
        slotMapping.set(tracked.slotIndex, newSlotIndex);
      }

      if (!tracked) {
        return;
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
    },
    trackedIdentities,
  );

  const entities = newEntities.map((entity) => {
    if (metricOverrides.has(entity)) {
      return { ...entity, definition: metricOverrides.get(entity) ?? null };
    }

    const tokenMap = exprTokenOverrides.get(entity);
    if (tokenMap && isExpressionEntry(entity)) {
      const newTokens = entity.tokens.map((token, index) => {
        if (!tokenMap.has(index)) {
          return token;
        }
        return { ...token, definition: tokenMap.get(index) };
      });
      const hasChanges = newTokens.some(
        (token, index) => token !== entity.tokens[index],
      );
      return hasChanges ? { ...entity, tokens: newTokens } : entity;
    }

    return entity;
  });

  return { entities, slotMapping };
}
