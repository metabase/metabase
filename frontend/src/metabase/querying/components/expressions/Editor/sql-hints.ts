/**
 * Finds SQL in a custom expression, and fixes for some SQL constructions, like
 * `[Total] IS NULL` for `isNull([Total])`. Users often assume that custom
 * expressions are SQL.
 */

export type SqlFix = {
  /** The text in the expression, for example `[Total] IS NULL`. */
  original: string;
  replacement: string;
  from: number;
  to: number;
};

// Keywords and operators that only SQL has, outside text and column names.
const SQL_SIGNALS = [
  /\bSELECT\b/i,
  /\bFROM\b/i,
  /\bWHERE\b/i,
  /\bGROUP\s+BY\b/i,
  /\bORDER\s+BY\b/i,
  /\bCASE\s+WHEN\b/i,
  /\bTHEN\b/i,
  /\bEND\b\s*$/i,
  /\bIS\s+(NOT\s+)?NULL\b/i,
  /\bI?LIKE\b/i,
  /\bCAST\s*\(/i,
  /\bCOUNT\s*\(\s*\*\s*\)/i,
  /\bCURRENT_(DATE|TIMESTAMP)\b/i,
  /\bINTERVAL\s+'/i,
  /\bIN\s*\(/,
  /<>/,
  /\|\|/,
  /::/,
];

// A simple operand: a column, a word, a call without nested parentheses, a
// text or a number. Columns and texts are masked, see `mask`.
const OPERAND = String.raw`(?:\[x*\]|"x*"|'x*'|[A-Za-z_][\w.]*(?:\s*\([^()]*\))?|-?\d+(?:\.\d+)?)`;

/**
 * The source with the content of texts and column names replaced by "x", so
 * that keywords in them do not match. Positions stay the same.
 */
function mask(source: string) {
  return source.replace(
    /\[(?:[^\]\\]|\\.)*\]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
    (match) =>
      match[0] + "x".repeat(match.length - 2) + match[match.length - 1],
  );
}

export function looksLikeSql(source: string) {
  const masked = mask(source);
  return SQL_SIGNALS.some((signal) => signal.test(masked));
}

type Rule = {
  pattern: RegExp;
  /** The fix, from the original text of the match and its groups. */
  fix: (groups: string[]) => string | null;
};

const toDoubleQuotes = (text: string) =>
  text.replace(/^'(.*)'$/s, (_, content: string) => JSON.stringify(content));

const CAST_FUNCTIONS: Record<string, string> = {
  int: "integer",
  integer: "integer",
  bigint: "integer",
  float: "float",
  double: "float",
  decimal: "float",
  numeric: "float",
  real: "float",
  text: "text",
  varchar: "text",
  char: "text",
  string: "text",
  date: "date",
  timestamp: "datetime",
  datetime: "datetime",
};

// CASE first: a fix of a whole CASE is clearer than fixes in its parts, which
// the next round of fixes finds.
const RULES: Rule[] = [
  {
    pattern: /\bCASE\s+(WHEN\b[\s\S]+?)\bEND\b/gi,
    fix: ([body]) => {
      // Only a CASE without a nested CASE.
      if (/\bCASE\b/i.test(body)) {
        return null;
      }
      const parts = body
        .split(/\b(WHEN|THEN|ELSE)\b/i)
        .map((part) => part.trim());
      const args: string[] = [];
      for (let i = 1; i < parts.length; i += 2) {
        const keyword = parts[i].toUpperCase();
        const value = toDoubleQuotes(parts[i + 1] ?? "");
        if (keyword === "WHEN" || keyword === "THEN" || keyword === "ELSE") {
          args.push(value);
        }
      }
      return args.length >= 2 ? `case(${args.join(", ")})` : null;
    },
  },
  {
    pattern: new RegExp(String.raw`(${OPERAND})\s+IS\s+NOT\s+NULL\b`, "gi"),
    fix: ([operand]) => `notNull(${operand})`,
  },
  {
    pattern: new RegExp(String.raw`(${OPERAND})\s+IS\s+NULL\b`, "gi"),
    fix: ([operand]) => `isNull(${operand})`,
  },
  {
    pattern: new RegExp(
      String.raw`(${OPERAND})\s+(NOT\s+)?(I?LIKE)\s+('x*')`,
      "gi",
    ),
    fix: ([operand, not, like, pattern]) => {
      const text = pattern.slice(1, -1);
      const inner = text.replace(/^%/, "").replace(/%$/, "");
      if (/[%_]/.test(inner)) {
        return null;
      }
      const name =
        text.startsWith("%") && text.endsWith("%") && text.length > 1
          ? "contains"
          : text.endsWith("%")
            ? "startsWith"
            : text.startsWith("%")
              ? "endsWith"
              : null;
      const value = JSON.stringify(inner);
      const options = /^ilike$/i.test(like) ? `, "case-insensitive"` : "";
      if (name == null) {
        return `${operand} ${not ? "!=" : "="} ${value}`;
      }
      if (not) {
        return name === "contains"
          ? `doesNotContain(${operand}, ${value}${options})`
          : `NOT ${name}(${operand}, ${value}${options})`;
      }
      return `${name}(${operand}, ${value}${options})`;
    },
  },
  {
    pattern: new RegExp(
      String.raw`(${OPERAND})\s+(NOT\s+)?IN\s*\(([^()]*)\)`,
      "gi",
    ),
    fix: ([operand, not, values]) =>
      `${not ? "notIn" : "in"}(${operand}, ${values
        .split(",")
        .map((value) => toDoubleQuotes(value.trim()))
        .join(", ")})`,
  },
  {
    pattern: new RegExp(
      String.raw`(${OPERAND})\s+BETWEEN\s+(${OPERAND})\s+AND\s+(${OPERAND})`,
      "gi",
    ),
    fix: ([operand, low, high]) =>
      `between(${operand}, ${toDoubleQuotes(low)}, ${toDoubleQuotes(high)})`,
  },
  {
    pattern: new RegExp(
      String.raw`CAST\s*\(\s*(${OPERAND})\s+AS\s+(\w+)[^)]*\)`,
      "gi",
    ),
    fix: ([operand, type]) => {
      const name = CAST_FUNCTIONS[type.toLowerCase()];
      return name ? `${name}(${operand})` : null;
    },
  },
  {
    // A whole chain, `a || b || c`, gives one concat. Only when the chain
    // has only simple operands: a part of a chain gives a wrong concat.
    pattern: new RegExp(
      String.raw`(?<!\|\|\s*)(${OPERAND}(?:\s*\|\|\s*${OPERAND})+)(?!\s*(?:\(|\|\|))`,
      "g",
    ),
    fix: ([chain]) =>
      `concat(${chain
        .split(/\s*\|\|\s*/)
        .map(toDoubleQuotes)
        .join(", ")})`,
  },
  { pattern: /\bCOUNT\s*\(\s*\*\s*\)/gi, fix: () => "Count()" },
  { pattern: /\bCURRENT_DATE\b/gi, fix: () => "today()" },
  {
    pattern: /\b(CURRENT_TIMESTAMP|GETDATE\s*\(\s*\)|SYSDATE)\b/gi,
    fix: () => "now()",
  },
  // Texts in single quotes, after the rules that read them.
  { pattern: /('x*')/g, fix: ([text]) => toDoubleQuotes(text) },
  { pattern: /<>/g, fix: () => "!=" },
  { pattern: /==/g, fix: () => "=" },
  { pattern: /&&/g, fix: () => "AND" },
];

// `x = NULL` has no simple rule above: the fix needs the operator.
const NULL_COMPARISON = new RegExp(
  String.raw`(${OPERAND})\s*(!?=|<>)\s*NULL\b`,
  "gi",
);

const MAX_DEPTH = 3;

const KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "true",
  "false",
  "case",
  "when",
  "then",
  "else",
  "end",
  "is",
  "null",
  "in",
  "like",
  "ilike",
  "between",
  "as",
  "select",
  "from",
  "where",
]);

/** A column name as SQL would write it: `customer_id` for "Customer ID". */
function toSqlName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Fixes for SQL constructions in `source`, which do not overlap, in the order
 * of the source. `columnNames` are the names of the columns, like
 * "Customer → Plan", to fix bare SQL names like `customer_id`.
 */
export function getSqlFixes(
  source: string,
  columnNames: string[],
  depth = 0,
): SqlFix[] {
  const masked = mask(source);
  const fixes: SqlFix[] = [];
  const overlaps = (from: number, to: number) =>
    fixes.some((fix) => from < fix.to && to > fix.from);

  const add = (from: number, to: number, replacement: string | null) => {
    if (replacement == null || overlaps(from, to)) {
      return;
    }
    const original = source.slice(from, to);
    if (original !== replacement) {
      fixes.push({ original, replacement, from, to });
    }
  };

  // The groups come from the masked text, so read them from the source.
  const groupsOf = (match: RegExpExecArray) => {
    const groups: string[] = [];
    let searchFrom = match.index;
    for (let i = 1; i < match.length; i++) {
      const group = match[i] ?? "";
      const start = masked.indexOf(group, searchFrom);
      groups.push(
        start >= 0 ? source.slice(start, start + group.length) : group,
      );
      if (start >= 0) {
        searchFrom = start + group.length;
      }
    }
    return groups;
  };

  for (const match of masked.matchAll(NULL_COMPARISON)) {
    const [operand, operator] = groupsOf(match);
    add(
      match.index,
      match.index + match[0].length,
      `${operator === "=" ? "isNull" : "notNull"}(${operand})`,
    );
  }
  // A fix also fixes the SQL in its parts, like the bare column names in the
  // conditions of a CASE.
  const fixParts = (text: string | null) =>
    text != null && depth < MAX_DEPTH
      ? applyAllSqlFixes(text, columnNames, depth + 1)
      : text;
  for (const rule of RULES) {
    for (const match of masked.matchAll(rule.pattern)) {
      add(
        match.index,
        match.index + match[0].length,
        fixParts(rule.fix(groupsOf(match))),
      );
    }
  }

  // Bare words that are column names in SQL style.
  const columnsBySqlName = new Map(
    columnNames.map((name) => [toSqlName(name), name]),
  );
  for (const match of masked.matchAll(/\b[A-Za-z_][\w.]*\b(?!\s*\()/g)) {
    const word = match[0];
    const before = masked[match.index - 1];
    if (KEYWORDS.has(word.toLowerCase()) || before === "[" || before === '"') {
      continue;
    }
    const name =
      columnsBySqlName.get(toSqlName(word.replace(/\./g, "_"))) ??
      columnsBySqlName.get(toSqlName(word.split(".").pop() ?? word));
    if (name != null) {
      add(match.index, match.index + word.length, `[${name}]`);
    }
  }

  return fixes.sort((a, b) => a.from - b.from);
}

/** The source with all fixes applied, round after round. */
export function applyAllSqlFixes(
  source: string,
  columnNames: string[],
  depth = 0,
) {
  let result = source;
  for (let round = 0; round < 5; round++) {
    const fixes = getSqlFixes(result, columnNames, depth);
    if (fixes.length === 0) {
      break;
    }
    result = applySqlFixes(result, fixes);
  }
  return result;
}

/** The source with the fixes applied. */
export function applySqlFixes(source: string, fixes: SqlFix[]) {
  return [...fixes]
    .sort((a, b) => b.from - a.from)
    .reduce(
      (text, fix) =>
        text.slice(0, fix.from) + fix.replacement + text.slice(fix.to),
      source,
    );
}
