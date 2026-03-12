import type { ExpressionToken, MathOperator } from "../../types/operators";
import type { SelectedMetric } from "../../types/viewer-state";

/**
 * Splits a flat token array into items at each separator token.
 * Always returns at least one item (possibly empty).
 */
export function splitByItems(tokens: ExpressionToken[]): ExpressionToken[][] {
  const items: ExpressionToken[][] = [[]];
  for (const token of tokens) {
    if (token.type === "separator") {
      items.push([]);
    } else {
      items[items.length - 1].push(token);
    }
  }
  return items;
}

/**
 * Builds a human-readable expression string from a single item's tokens.
 * Spaces are omitted after "(" and before ")".
 */
export function buildExpressionText(
  itemTokens: ExpressionToken[],
  selectedMetrics: SelectedMetric[],
): string {
  let result = "";
  for (let i = 0; i < itemTokens.length; i++) {
    const token = itemTokens[i];
    const prev = itemTokens[i - 1];
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
      result += selectedMetrics[token.metricIndex]?.name ?? "";
    } else if (token.type === "constant") {
      result += String(token.value);
    }
  }
  return result;
}

/**
 * Removes leading, trailing, and consecutive separator tokens,
 * which result in empty items. Safe to call at any time.
 */
export function cleanupSeparators(
  tokens: ExpressionToken[],
): ExpressionToken[] {
  const result: ExpressionToken[] = [];
  let prevWasSeparator = true; // treat start as separator to drop leading ones

  for (const token of tokens) {
    if (token.type === "separator") {
      if (!prevWasSeparator) {
        result.push(token);
        prevWasSeparator = true;
      }
    } else {
      result.push(token);
      prevWasSeparator = false;
    }
  }

  // Drop trailing separator
  if (result[result.length - 1]?.type === "separator") {
    result.pop();
  }

  return result;
}

/**
 * Builds the full editable text for all items joined by ", ".
 */
export function buildFullText(
  tokens: ExpressionToken[],
  selectedMetrics: SelectedMetric[],
): string {
  return splitByItems(tokens)
    .map((item) => buildExpressionText(item, selectedMetrics))
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
 * Parses a full expression text (potentially with ", " separators) back into
 * a flat ExpressionToken array. Only metrics present in `selectedMetrics` are
 * recognized; unresolved words are silently dropped.
 * Metric names are matched greedily, longest first, so names containing
 * operators (e.g. "Year-to-Date") are handled correctly.
 */
export function parseFullText(
  text: string,
  selectedMetrics: SelectedMetric[],
): ExpressionToken[] {
  const rawItems = text.split(",");
  const allTokens: ExpressionToken[] = [];

  rawItems.forEach((rawItem, idx) => {
    const itemTokens = parseItemText(rawItem, selectedMetrics);
    allTokens.push(...itemTokens);
    if (idx < rawItems.length - 1) {
      allTokens.push({ type: "separator" });
    }
  });

  return cleanupSeparators(allTokens);
}

function parseItemText(
  text: string,
  selectedMetrics: SelectedMetric[],
): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];

  // Sort metrics by name length descending for greedy longest-first matching
  const sortedMetrics = selectedMetrics
    .map((m, idx) => ({ name: (m.name ?? "").toLowerCase(), idx }))
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

    // Numeric literal: one or more digits, optionally followed by "." and more digits
    // e.g. "0.85", "100", "1.5" — but NOT a leading-dot form like ".85"
    if (ch >= "0" && ch <= "9") {
      let numStr = "";
      while (i < text.length && text[i] >= "0" && text[i] <= "9") {
        numStr += text[i++];
      }
      // Consume decimal part only when followed by at least one digit
      if (
        i < text.length &&
        text[i] === "." &&
        i + 1 < text.length &&
        text[i + 1] >= "0" &&
        text[i + 1] <= "9"
      ) {
        numStr += text[i++]; // consume "."
        while (i < text.length && text[i] >= "0" && text[i] <= "9") {
          numStr += text[i++];
        }
      }
      tokens.push({ type: "constant", value: parseFloat(numStr) });
      continue;
    }

    // Try to match a metric name (greedy, longest first)
    let matched = false;
    for (const { name, idx } of sortedMetrics) {
      if (lower.startsWith(name, i)) {
        const nextI = i + name.length;
        const nextCh = text[nextI];
        // Ensure we're at a word boundary (next char is a delimiter, space, or end)
        if (
          !nextCh ||
          nextCh === " " ||
          nextCh === "\t" ||
          EXPRESSION_DELIMITERS.has(nextCh)
        ) {
          tokens.push({ type: "metric", metricIndex: idx });
          i = nextI;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // Unrecognized character (partial name being typed) – skip
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
 * Removes unmatched parentheses from a token stream.
 * An open-paren with no matching close-paren, or a close-paren with no matching
 * open-paren, are both stripped. Returns the original reference if no change.
 */
export function removeUnmatchedParens(
  tokens: ExpressionToken[],
): ExpressionToken[] {
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
      // unmatched close-paren: intentionally not added to matchedIndices
    }
  });

  const hasDangling = tokens.some(
    (token, i) =>
      (token.type === "open-paren" || token.type === "close-paren") &&
      !matchedIndices.has(i),
  );

  if (!hasDangling) {
    return tokens; // same reference — no change
  }

  return tokens.filter((token, i) =>
    token.type !== "open-paren" && token.type !== "close-paren"
      ? true
      : matchedIndices.has(i),
  );
}

/**
 * Removes unnecessary parentheses from a token stream.
 * Parens are unnecessary when they contain 0 or 1 metric tokens (at any depth).
 * Runs repeatedly until no more cleanup is possible.
 */
export function cleanupParens(tokens: ExpressionToken[]): ExpressionToken[] {
  let current = tokens;
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < current.length; i++) {
      if (current[i].type !== "open-paren") {
        continue;
      }

      // Find the matching close-paren
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
        // Unmatched open-paren — skip
        continue;
      }

      const closeIdx = j - 1;
      const content = current.slice(i + 1, closeIdx);
      const operandCount = content.filter(
        (t) => t.type === "metric" || t.type === "constant",
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

type ExcludeMetric = {
  id: number;
  sourceType: "metric" | "measure";
};

type SearchResultLike = {
  id: number;
  model: "metric" | "measure";
};

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
