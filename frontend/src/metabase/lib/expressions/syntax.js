import _ from "underscore";

import { ExpressionCstVisitor, parse as parserParse } from "./parser";
import {
  lexer,
  lexerWithAny,
  Identifier,
  WhiteSpace,
  LParen,
  RParen,
  IdentifierString,
  FunctionName,
  AggregationFunctionName,
  Any,
  isTokenType,
  CLAUSE_TOKENS,
} from "./lexer";

import { MBQL_CLAUSES, getMBQLName } from ".";

const TOKENIZED_NODES = new Set(["dimension", "metric", "aggregation"]);

const syntax = (type, ...children) => ({
  type: type,
  tokenized: TOKENIZED_NODES.has(type),
  children: children.filter(child => child),
});

const token = (...args) => {
  const [type, token] = args.length === 1 ? ["token", args[0]] : args;
  return (
    token && {
      type: type,
      text: token.image,
      start: token.startOffset,
      end: token.endOffset,
    }
  );
};

export class ExpressionSyntaxVisitor extends ExpressionCstVisitor {
  constructor(options) {
    super();
    this._options = options;
    this.validateVisitor();
  }

  any(ctx) {
    return this.visit(ctx.expression);
  }

  expression(ctx) {
    return this.visit(ctx.additionExpression);
  }
  aggregation(ctx) {
    return this.visit(ctx.additionExpression);
  }

  additionExpression(ctx) {
    return this._arithmeticExpression(ctx.operands, ctx.AdditiveOperator);
  }
  multiplicationExpression(ctx) {
    return this._arithmeticExpression(ctx.operands, ctx.MultiplicativeOperator);
  }

  _arithmeticExpression(operands, operators) {
    const initial = [this.visit(operands[0])];
    for (let i = 1; i < operands.length; i++) {
      const operator = token(operators[i - 1]);
      const operand = this.visit(operands[i]);
      initial.push(operator);
      initial.push(operand);
    }
    return initial.length === 1 ? initial[0] : syntax("math", ...initial);
  }

  functionExpression(ctx) {
    const parts = [];
    parts.push(token("function-name", ctx.functionName[0]));
    if (ctx.LParen) {
      const args = [];
      if (ctx.arguments) {
        for (let i = 0; i < ctx.arguments.length; i++) {
          args.push(this.visit(ctx.arguments[i]));
          if (ctx.Comma && ctx.Comma[i]) {
            args.push(token(ctx.Comma[i]));
          }
        }
      }
      // NOTE: inserting a "group" node to match fallbackParser behavior
      parts.push(
        syntax(
          "group",
          token("open-paren", ctx.LParen[0]),
          ...args,
          token("close-paren", ctx.RParen[0]),
        ),
      );
    }

    const fn = getMBQLName(ctx.functionName[0].image);
    const clause = MBQL_CLAUSES[fn];

    return syntax(clause.type, ...parts);
  }

  caseExpression(ctx) {
    const parts = [];
    parts.push(token(ctx.case[0]));
    parts.push(token(ctx.LParen[0]));
    const commas = [...ctx.Comma];
    for (let i = 0; i < ctx.filter.length; i++) {
      if (i > 0) {
        parts.push(token(commas.shift()));
      }
      parts.push(this.visit(ctx.filter[i]));
      parts.push(token(commas.shift()));
      parts.push(this.visit(ctx.expression[i]));
    }
    if (commas.length > 0) {
      parts.push(token(commas.shift()));
      parts.push(this.visit(ctx.default[0]));
    }
    parts.push(token(ctx.RParen[0]));
    return syntax("case", ...parts);
  }

  metricExpression(ctx) {
    const metricName = this.visit(ctx.metricName);
    return syntax("metric", metricName);
  }
  segmentExpression(ctx) {
    const segmentName = this.visit(ctx.segmentName);
    return syntax("segment", segmentName);
  }
  dimensionExpression(ctx) {
    const dimensionName = this.visit(ctx.dimensionName);
    return syntax("dimension", dimensionName);
  }

  identifier(ctx) {
    return syntax("identifier", token(ctx.Identifier[0]));
  }
  identifierString(ctx) {
    return syntax("identifier-string", token(ctx.IdentifierString[0]));
  }
  stringLiteral(ctx) {
    return syntax("string", token(ctx.StringLiteral[0]));
  }
  numberLiteral(ctx) {
    return syntax(
      "number",
      ctx.Minus && token(ctx.Minus[0]),
      token(ctx.NumberLiteral[0]),
    );
  }
  atomicExpression(ctx) {
    return this.visit(ctx.expression);
  }
  parenthesisExpression(ctx) {
    return syntax(
      "group",
      token(ctx.LParen[0]),
      this.visit(ctx.expression),
      token(ctx.RParen[0]),
    );
  }

  // FILTERS

  filter(ctx) {
    return this.visit(ctx.booleanExpression);
  }
  booleanExpression(ctx) {
    return this._arithmeticExpression(ctx.operands, ctx.BooleanOperatorBinary);
  }
  comparisonExpression(ctx) {
    return syntax(
      "filter",
      this.visit(ctx.operands[0]),
      token(ctx.operators[0]),
      this.visit(ctx.operands[1]),
    );
  }
  booleanUnaryExpression(ctx) {
    return syntax(
      "filter",
      token(ctx.operators[0]),
      this.visit(ctx.operands[0]),
    );
  }
}

// DEFAULT PARSER
export function defaultParser(source, options) {
  const visitor = new ExpressionSyntaxVisitor(options);
  const cst = parserParse(source, options);
  return recoverWhitespace(visitor.visit(cst), source);
}

// RECOVERY PARSER
export function recoveryParser(source, options) {
  return recoveryParser(source, { ...options, recover: true });
}

// INSERT TRAILING STRING PARSER
export function insertTrailingStringParser(token) {
  return (source, options) =>
    trimTrailingString(defaultParser(source + token, options), token);
}

function trimTrailingString(tree, string = '"') {
  let node = tree;
  while (node.children && node.children.length > 0) {
    node = node.children[node.children.length - 1];
  }
  node.text = node.text.slice(0, -string.length);
  node.end--;
  return tree;
}

// SKIP LAST TOKEN PARSER:
export function skipLastTokenParser(source, options) {
  // special case, try skipping the last token
  // FIXME: shouldn't this be handled by single token deletion in recovery mode?
  const { tokens, errors } = lexer.tokenize(source);
  if (errors.length > 0) {
    throw errors;
  }
  const lastToken = tokens[tokens.length - 1];
  if (lastToken) {
    source = source.substring(0, lastToken.startOffset);
  }
  return defaultParser(source, options);
}

// FALLBACK PARSER:
// hand-rolled parser that parses enough for syntax highlighting
export function fallbackParser(expressionString, { startRule }) {
  const { tokens } = mergeTokenGroups(lexerWithAny.tokenize(expressionString));
  function nextNonWhitespace(index) {
    while (++index < tokens.length && tokens[index].tokenType === WhiteSpace) {
      // this block intentionally left blank
    }
    return tokens[index];
  }

  const root = { type: "group", children: [] };
  let current = root;
  let outsideAggregation = startRule === "aggregation";

  const stack = [];
  const push = element => {
    current.children.push(element);
    stack.push(current);
    current = element;
  };
  const pop = () => {
    if (stack.length === 0) {
      return;
    }
    current = stack.pop();
  };
  for (let i = 0; i < tokens.length; i++) {
    const isLast = i === tokens.length - 1;
    const t = tokens[i];
    const next = nextNonWhitespace(i);
    if (isTokenType(t.tokenType, FunctionName)) {
      const { type } = CLAUSE_TOKENS.get(t.tokenType);
      const clause = syntax(type, token("function-name", t));
      if (next && next.tokenType === LParen) {
        if (type === "aggregation") {
          outsideAggregation = false;
        }
        push(clause);
      } else {
        current.children.push(clause);
      }
    } else if (t.tokenType === Identifier) {
      current.children.push(
        syntax(
          outsideAggregation ? "metric" : "unknown", // "dimension" + "segment"
          syntax("identifier", token(t)),
        ),
      );
    } else if (
      t.tokenType === IdentifierString ||
      // special case for unclosed string literals
      (isLast && t.tokenType === Any && t.image.charAt(0) === '"')
    ) {
      current.children.push(
        syntax(
          outsideAggregation ? "metric" : "unknown", // "dimension" + "segment"
          token("identifier-string", t),
        ),
      );
    } else if (t.tokenType === LParen) {
      push(syntax("group"));
      current.children.push(token("open-paren", t));
    } else if (t.tokenType === RParen) {
      current.children.push(token("close-paren", t));
      pop();
      if (current.type === "aggregation") {
        outsideAggregation = true;
        pop();
      }
    } else {
      current.children.push(token(t));
    }
  }
  return root;
}

// merges all token groups (e.x. whitespace, comments) into a single array of tokens
function mergeTokenGroups(results) {
  const tokens = [];
  const groups = [results.tokens, ...Object.values(results.groups)];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let firstGroupIndex = -1;
    let firstStartOffset = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const token = groups[i][0];
      if (token && token.startOffset < firstStartOffset) {
        firstStartOffset = token.startOffset;
        firstGroupIndex = i;
      }
    }
    if (firstGroupIndex >= 0) {
      tokens.push(groups[firstGroupIndex].shift());
    } else {
      break;
    }
  }
  return { ...results, tokens, groups: {} };
}

// WHITESPACE UTILS

// inserts whitespace tokens back into the syntax tree
function whitespace(text) {
  if (!/^\s+$/.test(text)) {
    throw new Error("Recovered non-whitespace: " + text);
  }
  return { text };
}

// NOTE: could we use token groups instead to collect whitespace tokens?
// https://sap.github.io/chevrotain/docs/features/token_grouping.html
function recoverWhitespace(root, source) {
  const node = _recoverWhitespace(root, source);
  if (node.start > 0) {
    node.children.unshift(whitespace(source.substring(0, node.start)));
    node.start = 0;
  }
  if (node.end < source.length - 1) {
    node.children.push(whitespace(source.substring(node.end + 1)));
    node.end = source.length - 1;
  }
  return node;
}
function _recoverWhitespace(node, source) {
  if (node.children) {
    const children = [];
    let previous = null;
    for (const child of node.children) {
      // call recoverWhitespace on the child first to get start/end on non-terminals
      const current = _recoverWhitespace(child, source);
      // if the current node doesn't start where the previous node ended then add whitespace token back in
      if (previous && current.start > previous.end + 1) {
        children.push(
          whitespace(source.substring(previous.end + 1, current.start)),
        );
      }
      children.push(current);
      previous = current;
    }
    return {
      ...node,
      children,
      // add start/end to non-terminals
      start: children[0].start,
      end: children[children.length - 1].end,
    };
  } else {
    return node;
  }
}

// MAIN EXPORTED FUNCTIONS:

const DEFAULT_STRATEGIES = [defaultParser, fallbackParser];

export function parse(
  source,
  { strategies = DEFAULT_STRATEGIES, ...options } = {},
) {
  for (const strategy of strategies) {
    try {
      return strategy(source, options);
    } catch (e) {
      // console.warn(e)
    }
  }
  throw new Error("Unable to parse: " + source);
}

export function serialize(node) {
  if (node.children) {
    return node.children.map(serialize).join("");
  } else {
    return node.text || "";
  }
}
