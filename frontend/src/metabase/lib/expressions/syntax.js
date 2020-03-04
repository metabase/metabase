import { ExpressionCstVisitor, parse } from "./parser";
import {
  lexerWithRecovery,
  Identifier,
  WhiteSpace,
  LParen,
  RParen,
  IdentifierString,
  FunctionName,
  isTokenType,
  CLAUSE_TOKENS,
} from "./lexer";

import { MBQL_CLAUSES, getMBQLName } from ".";

const TOKENIZED_NODES = new Set(["dimension", "metric", "aggregation"]);

function syntaxNode(type, ...children) {
  return {
    type: type,
    tokenized: TOKENIZED_NODES.has(type),
    children: children.filter(child => child),
  };
}

function tokenNode(...args) {
  let [type, token] = args.length === 1 ? ["token", args[0]] : args;
  // allow passing the array token
  if (Array.isArray(token)) {
    if (token.length !== 1) {
      console.warn(
        `Passed token array of length ${token.length} to tokenNode()`,
        token,
      );
    }
    token = token[0];
  }
  return (
    token && {
      type: type,
      text: token.image,
      start: token.startOffset,
      end: token.endOffset,
      _token: token,
    }
  );
}

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
    return this.visit(ctx.expression);
  }
  aggregation(ctx) {
    return this.visit(ctx.expression);
  }
  number(ctx) {
    return this.visit(ctx.expression);
  }
  string(ctx) {
    return this.visit(ctx.expression);
  }
  boolean(ctx) {
    return this.visit(ctx.expression);
  }

  additionExpression(ctx) {
    return this._arithmeticExpression(ctx.operands, ctx.operators);
  }
  multiplicationExpression(ctx) {
    return this._arithmeticExpression(ctx.operands, ctx.operators);
  }

  _arithmeticExpression(operands = [], operators = []) {
    const initial = [];
    for (let i = 0; i < operands.length; i++) {
      initial.push(this.visit(operands[i]));
      if (i < operators.length) {
        initial.push(tokenNode(operators[i]));
      }
    }
    return initial.length === 0
      ? null
      : initial.length === 1
      ? initial[0]
      : syntaxNode("math", ...initial);
  }

  functionExpression(ctx) {
    const parts = [];
    parts.push(tokenNode("function-name", ctx.functionName));
    if (ctx.LParen) {
      const args = [];
      if (ctx.arguments) {
        for (let i = 0; i < ctx.arguments.length; i++) {
          args.push(this.visit(ctx.arguments[i]));
          if (ctx.Comma && ctx.Comma[i]) {
            args.push(tokenNode(ctx.Comma[i]));
          }
        }
      }
      // NOTE: inserting a "group" node to match fallbackParser behavior
      parts.push(
        syntaxNode(
          "group",
          tokenNode("open-paren", ctx.LParen),
          ...args,
          tokenNode("close-paren", ctx.RParen),
        ),
      );
    }

    const fn = getMBQLName(ctx.functionName[0].image);
    const clause = MBQL_CLAUSES[fn];

    return syntaxNode(clause.type, ...parts);
  }

  caseExpression(ctx) {
    return this.functionExpression(ctx);
  }

  metricExpression(ctx) {
    const metricName = this.visit(ctx.metricName);
    return syntaxNode("metric", metricName);
  }
  segmentExpression(ctx) {
    const segmentName = this.visit(ctx.segmentName);
    return syntaxNode("segment", segmentName);
  }
  dimensionExpression(ctx) {
    const dimensionName = this.visit(ctx.dimensionName);
    return syntaxNode("dimension", dimensionName);
  }

  identifier(ctx) {
    return syntaxNode("identifier", tokenNode(ctx.Identifier));
  }
  identifierString(ctx) {
    return syntaxNode("identifier", tokenNode(ctx.IdentifierString));
  }
  stringLiteral(ctx) {
    return syntaxNode("string-literal", tokenNode(ctx.StringLiteral));
  }
  numberLiteral(ctx) {
    return syntaxNode(
      "number-literal",
      tokenNode(ctx.Minus),
      tokenNode(ctx.NumberLiteral),
    );
  }
  atomicExpression(ctx) {
    return this.visit(ctx.expression);
  }
  parenthesisExpression(ctx) {
    return syntaxNode(
      "group",
      tokenNode(ctx.LParen),
      this.visit(ctx.expression),
      tokenNode(ctx.RParen),
    );
  }

  // FILTERS
  booleanExpression(ctx) {
    return this._arithmeticExpression(ctx.operands, ctx.operators);
  }
  comparisonExpression(ctx) {
    return syntaxNode(
      "filter",
      this.visit(ctx.operands[0]),
      tokenNode(ctx.operators),
      this.visit(ctx.operands[1]),
    );
  }
  booleanUnaryExpression(ctx) {
    return syntaxNode(
      "filter",
      tokenNode(ctx.operators),
      this.visit(ctx.operands),
    );
  }
}

// DEFAULT PARSER
export function defaultParser(options) {
  const { cst, tokenVector } = parse(options);
  const visitor = new ExpressionSyntaxVisitor({ tokenVector, ...options });
  const visited = cst && visitor.visit(cst);
  return (
    visited &&
    recoverTokens(
      visited,
      options.source,
      options.recover ? recoveredNode : recoveredWhitespaceNode,
    )
  );
}

// RECOVERY PARSER
export function recoveryParser(options) {
  return defaultParser({ ...options, recover: true });
}

// FALLBACK PARSER:
// hand-rolled parser that parses enough for syntax highlighting
export function fallbackParser({ source, startRule }) {
  const { tokens } = mergeTokenGroups(lexerWithRecovery.tokenize(source));
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
    const t = tokens[i];
    const next = nextNonWhitespace(i);
    if (isTokenType(t.tokenType, FunctionName)) {
      const { type } = CLAUSE_TOKENS.get(t.tokenType);
      const clause = syntaxNode(type, tokenNode("function-name", t));
      if (next && next.tokenType === LParen) {
        if (type === "aggregation") {
          outsideAggregation = false;
        }
        push(clause);
      } else {
        current.children.push(clause);
      }
    } else if (
      isTokenType(t.tokenType, Identifier) ||
      isTokenType(t.tokenType, IdentifierString)
    ) {
      current.children.push(
        syntaxNode(
          outsideAggregation ? "metric" : "unknown", // "dimension" + "segment"
          syntaxNode("identifier", tokenNode(t)),
        ),
      );
    } else if (t.tokenType === LParen) {
      push(syntaxNode("group"));
      current.children.push(tokenNode("open-paren", t));
    } else if (t.tokenType === RParen) {
      current.children.push(tokenNode("close-paren", t));
      pop();
      if (current.type === "aggregation") {
        outsideAggregation = true;
        pop();
      }
    } else {
      current.children.push(tokenNode(t));
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

// inserts whitespace tokens back into the syntax tree
function recoveredWhitespaceNode(text, extra = {}) {
  if (!/^\s+$/.test(text)) {
    throw new Error("Recovered non-whitespace: " + text);
  }
  return {
    type: "whitespace",
    ...extra,
    text,
  };
}

function recoveredNode(text, extra = {}) {
  return {
    type: /^\s+$/.test(text) ? "whitespace" : "recovered",
    ...extra,
    text,
  };
}

// NOTE: could we use token groups instead to collect whitespace tokens?
// https://sap.github.io/chevrotain/docs/features/token_grouping.html
function recoverTokens(root, source, recovered = recoveredNode) {
  const getRecoveredToken = (start, end) =>
    recovered(source.substring(start, end), { start, end: end - 1 });

  function recover(node) {
    if (node.children) {
      const children = [];
      let previous = null;
      for (const child of node.children) {
        // call recover on the child first to get start/end on non-terminals
        const current = recover(child);
        // if the current node doesn't start where the previous node ended then add whitespace token back in
        if (previous && current.start > previous.end + 1) {
          children.push(getRecoveredToken(previous.end + 1, current.start));
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

  const node = recover(root);
  if (node.start > 0) {
    node.children.unshift(getRecoveredToken(0, node.start));
    node.start = 0;
  }
  if (node.end < source.length - 1) {
    node.children.push(getRecoveredToken(node.end + 1, source.length));
    node.end = source.length - 1;
  }
  return node;
}

// MAIN EXPORTED FUNCTIONS:

const DEFAULT_STRATEGIES = [recoveryParser, fallbackParser];

export function syntax({ strategies = DEFAULT_STRATEGIES, ...options } = {}) {
  for (const strategy of strategies) {
    try {
      return strategy(options);
    } catch (e) {
      // console.warn(e)
    }
  }
  throw new Error("Unable to parse: " + options.source);
}

export function serialize(node) {
  if (node.children) {
    return node.children.map(serialize).join("");
  } else {
    return node.text || "";
  }
}
