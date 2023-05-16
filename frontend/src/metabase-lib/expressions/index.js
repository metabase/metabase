export * from "./config";

import { FK_SYMBOL } from "metabase/lib/formatting";
import Dimension, { ExpressionDimension } from "metabase-lib/Dimension";
import {
  OPERATORS,
  FUNCTIONS,
  EDITOR_QUOTES,
  EDITOR_FK_SYMBOLS,
  getMBQLName,
} from "./config";

// Return a copy with brackets (`[` and `]`) being escaped
function escapeString(string) {
  let str = "";
  for (let i = 0; i < string.length; ++i) {
    const ch = string[i];
    if (ch === "[" || ch === "]") {
      str += "\\";
    }
    str += ch;
  }
  return str;
}

// The opposite of escapeString
export function unescapeString(string) {
  let str = "";
  for (let i = 0; i < string.length; ++i) {
    const ch1 = string[i];
    const ch2 = string[i + 1];
    if (ch1 === "\\" && (ch2 === "[" || ch2 === "]")) {
      // skip
    } else {
      str += ch1;
    }
  }
  return str;
}

// IDENTIFIERS

// can be double-quoted, but are not by default unless they have non-word characters or are reserved
export function formatIdentifier(name, { quotes = EDITOR_QUOTES } = {}) {
  if (
    !quotes.identifierAlwaysQuoted &&
    /^\w+$/.test(name) &&
    !isReservedWord(name)
  ) {
    return name;
  }
  return quoteString(name, quotes.identifierQuoteDefault);
}

function isReservedWord(word) {
  return !!getMBQLName(word);
}

// METRICS

export function parseMetric(metricName, { query }) {
  return query
    .table()
    .metrics.find(
      metric => metric.name.toLowerCase() === metricName.toLowerCase(),
    );
}

export function formatMetricName(metric, options) {
  return formatIdentifier(metric.name, options);
}

// SEGMENTS

export function parseSegment(segmentName, { query }) {
  const table = query.table();
  const segment = table.segments.find(
    segment => segment.name.toLowerCase() === segmentName.toLowerCase(),
  );
  if (segment) {
    return segment;
  }

  const field = table.fields.find(
    field => field.name.toLowerCase() === segmentName.toLowerCase(),
  );
  if (field?.isBoolean()) {
    return field;
  }
}

export function formatSegmentName(segment, options) {
  return formatIdentifier(segment.name, options);
}

// DIMENSIONS

/**
 * Find dimension with matching `name` in query. TODO - How is this "parsing" a dimension? Not sure about this name.
 */
export function parseDimension(name, { reference, query }) {
  // FIXME: this is pretty inefficient, create a lookup table?
  return query
    .dimensionOptions()
    .all()
    .filter(
      d =>
        !(d instanceof ExpressionDimension) ||
        getDimensionName(d) !== reference,
    )
    .find(d =>
      EDITOR_FK_SYMBOLS.symbols.some(
        separator => getDimensionName(d, separator) === name,
      ),
    );
}

export function formatDimensionName(dimension, options) {
  return formatIdentifier(getDimensionName(dimension), options);
}

/**
 * TODO -- this doesn't really return the dimension *name*, does it? It returns the 'rendered' dimension decscription
 * with the FK symbol (→) replaced with a different character.
 */
export function getDimensionName(
  dimension,
  separator = EDITOR_FK_SYMBOLS.default,
) {
  return dimension.render().replace(` ${FK_SYMBOL} `, separator);
}

// STRING LITERALS

export function formatStringLiteral(
  mbqlString,
  { quotes = EDITOR_QUOTES } = {},
) {
  return quoteString(mbqlString, quotes.literalQuoteDefault);
}

const DOUBLE_QUOTE = '"';
const SINGLE_QUOTE = "'";
const BACKSLASH = "\\";

const STRING_ESCAPE = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
};

const STRING_UNESCAPE = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
};

export function quoteString(string, quote) {
  if (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE) {
    let str = "";
    for (let i = 0; i < string.length; ++i) {
      const ch = string[i];
      if (ch === quote && string[i - 1] !== BACKSLASH) {
        str += BACKSLASH + ch;
      } else {
        const sub = STRING_ESCAPE[ch];
        str += sub ? sub : ch;
      }
    }
    return quote + str + quote;
  } else if (quote === "[") {
    return "[" + escapeString(string) + "]";
  } else if (quote === "") {
    // unquoted
    return string;
  } else {
    throw new Error("Unknown quoting: " + quote);
  }
}

export function unquoteString(string) {
  const quote = string.charAt(0);
  if (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE) {
    let str = "";
    for (let i = 1; i < string.length - 1; ++i) {
      const ch = string[i];
      if (ch === BACKSLASH) {
        const seq = string[i + 1];
        const unescaped = STRING_UNESCAPE[seq];
        if (unescaped) {
          str += unescaped;
          ++i;
          continue;
        }
      }
      str += ch;
    }
    return str;
  } else if (quote === "[") {
    return unescapeString(string).slice(1, -1);
  } else {
    throw new Error("Unknown quoting: " + string);
  }
}

// move to query lib

export function isExpression(expr) {
  return (
    isLiteral(expr) ||
    isOperator(expr) ||
    isFunction(expr) ||
    isDimension(expr) ||
    isBooleanLiteral(expr) ||
    isMetric(expr) ||
    isSegment(expr) ||
    isCase(expr)
  );
}

export function isLiteral(expr) {
  return isStringLiteral(expr) || isNumberLiteral(expr);
}

export function isStringLiteral(expr) {
  return typeof expr === "string";
}

export function isBooleanLiteral(expr) {
  return typeof expr === "boolean";
}

export function isNumberLiteral(expr) {
  return typeof expr === "number";
}

export function isOperator(expr) {
  return (
    Array.isArray(expr) &&
    OPERATORS.has(expr[0]) &&
    expr
      .slice(1, hasOptions(expr) ? -1 : 0) // skip options object at the end
      .every(isExpression)
  );
}

function isPlainObject(obj) {
  return obj && Object.getPrototypeOf(obj) === Object.prototype;
}

export function hasOptions(expr) {
  return isPlainObject(expr[expr.length - 1]);
}

export function isFunction(expr) {
  return (
    Array.isArray(expr) &&
    FUNCTIONS.has(expr[0]) &&
    expr
      .slice(1, hasOptions(expr) ? -1 : 0) // skip options object at the end
      .every(isExpression)
  );
}

export function isDimension(expr) {
  return !!Dimension.parseMBQL(expr);
}

export function isMetric(expr) {
  return (
    Array.isArray(expr) &&
    expr[0] === "metric" &&
    expr.length === 2 &&
    typeof expr[1] === "number"
  );
}

export function isSegment(expr) {
  return (
    Array.isArray(expr) &&
    expr[0] === "segment" &&
    expr.length === 2 &&
    typeof expr[1] === "number"
  );
}

export function isCase(expr) {
  return Array.isArray(expr) && expr[0] === "case"; // && _.all(expr.slice(1), isValidArg)
}
