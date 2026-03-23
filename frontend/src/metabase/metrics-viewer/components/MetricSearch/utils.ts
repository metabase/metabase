import { t } from "ttag";

import type { MathOperator } from "../../types/operators";
import type {
  ExpressionSubToken,
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  SelectedMetric,
} from "../../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../../types/viewer-state";
import { getDefinitionName } from "../../utils/definition-builder";

/**
 * Builds a human-readable expression string from a single expression's
 * sub-tokens. Spaces are omitted after "(" and before ")".
 */
export function buildExpressionText(
  tokens: ExpressionSubToken[],
  metricEntries: MetricDefinitionEntry[],
): string {
  let result = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = tokens[i - 1];
    if (i > 0 && prev?.type !== "open-paren" && token.type !== "close-paren") {
      result += " ";
    }
    if (token.type === "open-paren") {
      result += "(";
    } else if (token.type === "close-paren") {
      result += ")";
    } else if (token.type === "operator") {
      result += token.op;
    } else if (token.type === "metric") {
      const entry = metricEntries.find((e) => e.id === token.sourceId);
      const name = entry?.definition
        ? getDefinitionName(entry.definition)
        : null;
      result += name ?? "";
    } else if (token.type === "constant") {
      result += String(token.value);
    }
  }
  return result;
}

/**
 * Builds the full editable text for all formula entities, joined by ", ".
 * Metric entries become their display name (looked up from definitions map);
 * expression entries are reconstructed from their sub-tokens.
 */
export function buildFullText(
  formulaEntities: MetricsViewerFormulaEntity[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
): string {
  const metricEntries = Object.values(definitions)
    .filter(
      (e): e is MetricDefinitionEntry =>
        "type" in e || e.definition !== undefined,
    )
    .map((e) => ({ ...e, type: "metric" as const }));
  return formulaEntities
    .map((entity) => {
      if (isExpressionEntry(entity)) {
        return buildExpressionText(entity.tokens, metricEntries);
      }
      if (isMetricEntry(entity)) {
        const def = definitions[entity.id];
        const name = def?.definition ? getDefinitionName(def.definition) : null;
        return name ?? "";
      }
      return "";
    })
    .join(", ");
}

const EXPRESSION_DELIMITERS = new Set(["+", "-", "*", "/", "(", ")", ","]);

/** Delimiters that are always boundaries (everything except comma). */
const NON_COMMA_DELIMITERS = new Set(["+", "-", "*", "/", "(", ")"]);

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
  metricEntries?: MetricDefinitionEntry[],
): { word: string; start: number; end: number } {
  // Build a set of metric names (lowercased) for quick lookup.
  let metricNamesLower: Set<string> | null = null;
  if (metricEntries && metricEntries.length > 0) {
    metricNamesLower = new Set(
      metricEntries
        .map((e) =>
          (
            (e.definition ? getDefinitionName(e.definition) : null) ?? ""
          ).toLowerCase(),
        )
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
      if (
        beforeLower.endsWith(name) &&
        (before.length === name.length ||
          NON_COMMA_DELIMITERS.has(before[before.length - name.length - 1]) ||
          before[before.length - name.length - 1] === "," ||
          before[before.length - name.length - 1] === " ")
      ) {
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
    if (ch === ",") {
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
    if (text[i] === "," && !metricRanges.some((r) => i >= r.from && i < r.to)) {
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

/** Strip position info from a positioned token, dropping unknown tokens. */
function stripPositions(token: PositionedToken): ExpressionSubToken | null {
  if (token.type === "metric") {
    return { type: "metric", sourceId: token.sourceId };
  }
  if (token.type === "operator") {
    return { type: "operator", op: token.op };
  }
  if (token.type === "constant") {
    return { type: "constant", value: token.value };
  }
  if (token.type === "open-paren") {
    return { type: "open-paren" };
  }
  if (token.type === "unknown") {
    return null;
  }
  return { type: "close-paren" };
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
  metricEntries: MetricDefinitionEntry[],
): MetricsViewerFormulaEntity[] {
  const allTokens = parseFullTextWithPositions(text, metricEntries);
  const separators = findSeparatorCommaPositions(text, allTokens);
  const segments = groupTokensBySegment(allTokens, separators);
  const result: MetricsViewerFormulaEntity[] = [];

  for (const segmentTokens of segments) {
    if (segmentTokens.length === 0) {
      continue;
    }

    const subTokens = segmentTokens
      .map(stripPositions)
      .filter((t): t is ExpressionSubToken => t !== null);

    // Single metric reference without operators → standalone metric entry
    const firstToken = subTokens[0];
    if (subTokens.length === 1 && firstToken.type === "metric") {
      const existing = metricEntries.find((e) => e.id === firstToken.sourceId);
      if (existing) {
        result.push(existing);
        continue;
      }
    }

    // Multiple tokens or operators → expression entry
    const name = buildExpressionText(subTokens, metricEntries);
    result.push({
      id: `expression:${name}`,
      type: "expression",
      name,
      tokens: subTokens,
    });
  }

  return result;
}

export function getSelectedMetricIds(
  selectedMetrics: SelectedMetric[],
): Set<number> {
  return new Set(
    selectedMetrics
      .filter((metric) => metric.sourceType === "metric")
      .map((metric) => metric.id),
  );
}

export function getSelectedMeasureIds(
  selectedMetrics: SelectedMetric[],
): Set<number> {
  return new Set(
    selectedMetrics
      .filter((metric) => metric.sourceType === "measure")
      .map((metric) => metric.id),
  );
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

/**
 * Validates a single expression's sub-token stream.
 * Returns a user-facing error message, or null if valid.
 */
export function validateExpression(
  tokens: ExpressionSubToken[],
): string | null {
  if (tokens.length === 0) {
    return null;
  }

  // 1. Unmatched parentheses
  let depth = 0;
  for (const token of tokens) {
    if (token.type === "open-paren") {
      depth++;
    } else if (token.type === "close-paren") {
      depth--;
      if (depth < 0) {
        return t`Unmatched closing parenthesis`;
      }
    }
  }
  if (depth > 0) {
    return t`Unmatched opening parenthesis`;
  }

  // 2 & 3. Consecutive / leading / trailing operators, and empty parens
  let prevSignificant: ExpressionSubToken | null = null;
  for (const token of tokens) {
    if (token.type === "operator") {
      if (prevSignificant === null) {
        return t`Expression cannot start with an operator`;
      }
      if (prevSignificant.type === "operator") {
        return t`Two operators in a row without a metric between them`;
      }
      if (prevSignificant.type === "open-paren") {
        return t`Operator right after opening parenthesis`;
      }
    }
    if (
      token.type === "close-paren" &&
      prevSignificant?.type === "open-paren"
    ) {
      return t`Empty parentheses`;
    }
    prevSignificant = token;
  }
  if (prevSignificant?.type === "operator") {
    return t`Expression cannot end with an operator`;
  }

  // 4. Must have at least one operand
  const hasOperand = tokens.some(
    (tok) => tok.type === "metric" || tok.type === "constant",
  );
  if (!hasOperand) {
    return t`Expression must contain at least one metric`;
  }

  return null;
}

// ── Positioned token type (internal) ────────────────────────────────────────

export type PositionedToken = (
  | ExpressionSubToken
  | { type: "unknown"; text: string }
) & { from: number; to: number };

/** Same as the main parser but records character positions for each token. */
export function parseFullTextWithPositions(
  text: string,
  metricEntries: MetricDefinitionEntry[],
): PositionedToken[] {
  const sortedMetrics = metricEntries
    .map((entry) => ({
      name: (
        (entry.definition ? getDefinitionName(entry.definition) : null) ?? ""
      ).toLowerCase(),
      sourceId: entry.id,
    }))
    .filter((m) => m.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  const lower = text.toLowerCase();
  const tokens: PositionedToken[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    // Commas are item separators — tracked for position-based splitting
    // but NOT emitted as a token type (no more "separator" tokens).
    if (ch === ",") {
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

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({
        type: "operator",
        op: ch as MathOperator,
        from: i,
        to: i + 1,
      });
      i++;
      continue;
    }

    if (ch >= "0" && ch <= "9") {
      const start = i;
      let numStr = "";
      while (i < text.length && text[i] >= "0" && text[i] <= "9") {
        numStr += text[i++];
      }
      if (
        i < text.length &&
        text[i] === "." &&
        i + 1 < text.length &&
        text[i + 1] >= "0" &&
        text[i + 1] <= "9"
      ) {
        numStr += text[i++];
        while (i < text.length && text[i] >= "0" && text[i] <= "9") {
          numStr += text[i++];
        }
      }
      tokens.push({
        type: "constant",
        value: parseFloat(numStr),
        from: start,
        to: i,
      });
      continue;
    }

    let matched = false;
    for (const { name, sourceId } of sortedMetrics) {
      if (lower.startsWith(name, i)) {
        const nextI = i + name.length;
        const nextCh = text[nextI];
        // Accept the match unless the next character continues an
        // alphanumeric word (e.g. "Revenue" inside "Revenues").
        if (
          !nextCh ||
          !isWordChar(nextCh) ||
          !isWordChar(name[name.length - 1])
        ) {
          tokens.push({ type: "metric", sourceId, from: i, to: nextI });
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
        const c = text[i];
        if (
          c === " " ||
          c === "\t" ||
          c === "," ||
          c === "(" ||
          c === ")" ||
          c === "+" ||
          c === "-" ||
          c === "*" ||
          c === "/" ||
          (c >= "0" && c <= "9")
        ) {
          break;
        }
        // Check if a metric name starts here — if so, stop the unknown span
        let metricStartsHere = false;
        for (const { name } of sortedMetrics) {
          if (lower.startsWith(name, i)) {
            const nI = i + name.length;
            const nC = text[nI];
            if (
              !nC ||
              nC === " " ||
              nC === "\t" ||
              EXPRESSION_DELIMITERS.has(nC)
            ) {
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
  metricEntries: MetricDefinitionEntry[],
): ErrorRange[] {
  const allTokens = parseFullTextWithPositions(text, metricEntries);
  const separators = findSeparatorCommaPositions(text, allTokens);
  const segments = groupTokensBySegment(allTokens, separators);

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

    // Consecutive / leading / trailing operators, operator after "(", empty parens
    let prevSignificant: PositionedToken | null = null;
    for (const token of itemTokens) {
      if (token.type === "operator") {
        if (prevSignificant === null) {
          itemInvalid.push({
            from: token.from,
            to: token.to,
            message: t`Expression cannot start with an operator`,
          });
        } else if (prevSignificant.type === "operator") {
          itemInvalid.push({
            from: token.from,
            to: token.to,
            message: t`Two operators in a row without a metric between them`,
          });
        } else if (prevSignificant.type === "open-paren") {
          itemInvalid.push({
            from: token.from,
            to: token.to,
            message: t`Operator right after opening parenthesis`,
          });
        }
      }
      if (
        token.type === "close-paren" &&
        prevSignificant?.type === "open-paren"
      ) {
        itemInvalid.push({
          from: prevSignificant.from,
          to: token.to,
          message: t`Empty parentheses`,
        });
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

    // Unknown tokens
    for (const token of itemTokens) {
      if (token.type === "unknown") {
        itemInvalid.push({
          from: token.from,
          to: token.to,
          message: t`Unknown token: "${token.text}"`,
        });
      }
    }

    // No operands at all
    const hasOperand = itemTokens.some(
      (tok) => tok.type === "metric" || tok.type === "constant",
    );
    if (!hasOperand && itemInvalid.length === 0) {
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
  selectedMetricIds: Set<number>,
  selectedMeasureIds: Set<number>,
  excludeMetric?: ExcludeMetric,
): T[] {
  return results.filter(
    (result) =>
      (result.model === "metric"
        ? !selectedMetricIds.has(result.id)
        : !selectedMeasureIds.has(result.id)) &&
      (!excludeMetric ||
        result.id !== excludeMetric.id ||
        result.model !== excludeMetric.sourceType),
  );
}
