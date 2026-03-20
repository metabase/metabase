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

/**
 * Extracts the "word" (potential metric name) at the given cursor position,
 * using expression delimiters (+, -, *, /, (, ), ,) as boundaries.
 * Spaces are NOT delimiters so that multi-word metric names like "Page Views"
 * are returned as a single word. Surrounding whitespace is trimmed.
 */
export function getWordAtCursor(
  text: string,
  cursorPos: number,
): { word: string; start: number; end: number } {
  let start = cursorPos;
  while (start > 0 && !EXPRESSION_DELIMITERS.has(text[start - 1])) {
    start--;
  }

  let end = cursorPos;
  while (end < text.length && !EXPRESSION_DELIMITERS.has(text[end])) {
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
 * Parses a full expression text (with ", " separating items) into a
 * `MetricsViewerFormulaEntity[]`. Each comma-separated segment becomes
 * either a standalone metric entry (if it matches a single metric name) or
 * an expression entry (if it contains operators / multiple operands).
 *
 * Metric names are matched greedily, longest first, so names containing
 * operators (e.g. "Year-to-Date") are handled correctly.
 */
export function parseFullText(
  text: string,
  metricEntries: MetricDefinitionEntry[],
): MetricsViewerFormulaEntity[] {
  const rawItems = text.split(",");
  const result: MetricsViewerFormulaEntity[] = [];

  for (const rawItem of rawItems) {
    const trimmed = rawItem.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const subTokens = parseItemText(rawItem, metricEntries);
    if (subTokens.length === 0) {
      continue;
    }

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
    const metricEntriesForName = metricEntries;
    const name = buildExpressionText(subTokens, metricEntriesForName);
    result.push({
      id: `expression:${name}`,
      type: "expression",
      name,
      tokens: subTokens,
    });
  }

  return result;
}

function parseItemText(
  text: string,
  metricEntries: MetricDefinitionEntry[],
): ExpressionSubToken[] {
  const tokens: ExpressionSubToken[] = [];

  // Sort metrics by name length descending for greedy longest-first matching
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
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Skip whitespace
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    // Parens
    if (ch === "(") {
      tokens.push({ type: "open-paren" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "close-paren" });
      i++;
      continue;
    }

    // Math operators
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "operator", op: ch as MathOperator });
      i++;
      continue;
    }

    // Numeric literal
    if (ch >= "0" && ch <= "9") {
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
      tokens.push({ type: "constant", value: parseFloat(numStr) });
      continue;
    }

    // Try to match a metric name (greedy, longest first)
    let matched = false;
    for (const { name, sourceId } of sortedMetrics) {
      if (lower.startsWith(name, i)) {
        const nextI = i + name.length;
        const nextCh = text[nextI];
        if (
          !nextCh ||
          nextCh === " " ||
          nextCh === "\t" ||
          EXPRESSION_DELIMITERS.has(nextCh)
        ) {
          tokens.push({ type: "metric", sourceId });
          i = nextI;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      i++;
    }
  }

  return tokens;
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

export type PositionedToken = ExpressionSubToken & { from: number; to: number };

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
        if (
          !nextCh ||
          nextCh === " " ||
          nextCh === "\t" ||
          EXPRESSION_DELIMITERS.has(nextCh)
        ) {
          tokens.push({ type: "metric", sourceId, from: i, to: nextI });
          i = nextI;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      i++;
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
  // Split text by commas to get item boundaries, then parse + validate each
  const allTokens = parseFullTextWithPositions(text, metricEntries);

  // Group tokens by their comma-separated segment (by character position)
  const commaPositions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ",") {
      commaPositions.push(i);
    }
  }

  // Build segments: tokens between consecutive commas
  const segments: PositionedToken[][] = [];
  let segmentTokens: PositionedToken[] = [];
  let commaIdx = 0;
  for (const token of allTokens) {
    while (
      commaIdx < commaPositions.length &&
      token.from > commaPositions[commaIdx]
    ) {
      segments.push(segmentTokens);
      segmentTokens = [];
      commaIdx++;
    }
    segmentTokens.push(token);
  }
  segments.push(segmentTokens);

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
