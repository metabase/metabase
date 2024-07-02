import { t } from "ttag";

import { tokenize, TOKEN, OPERATOR as OP } from "./tokenizer";

import { getMBQLName, MBQL_CLAUSES, unescapeString } from "./index";

const COMPARISON_OPS = [
  OP.Equal,
  OP.NotEqual,
  OP.GreaterThan,
  OP.LessThan,
  OP.GreaterThanEqual,
  OP.LessThanEqual,
];

function recursiveParse(source) {
  const { tokens } = tokenize(source);

  // Get the next token and remove it from the token list
  const next = () => tokens.shift();

  // Throw an error if the next token isn't the expected operator
  const expectOp = nextOp => {
    const token = next();
    if (!token) {
      throw new Error(t`Unexpected end of input, expecting ${nextOp}`);
    }
    const { type, op, start, end } = token;
    if (type !== TOKEN.Operator || op !== nextOp) {
      const text = source.substring(start, end);
      throw new Error(t`Expecting ${nextOp} but got ${text} instead`);
    }
  };

  // Return true if the next token is one of the specified operators
  const matchOps = ops =>
    tokens.length > 0 &&
    tokens[0].type === TOKEN.Operator &&
    ops.includes(tokens[0].op);

  // Group ::= "(" Expression ")"
  const parseGroup = () => {
    expectOp(OP.OpenParenthesis);
    const expr = parseExpression();
    const terminated = matchOps([OP.CloseParenthesis]);
    expectOp(OP.CloseParenthesis);
    if (!terminated) {
      throw new Error(t`Expecting a closing parenthesis`);
    }
    return expr;
  };

  // Parameters ::= "(" * Expression ")"
  const parseParameters = () => {
    expectOp(OP.OpenParenthesis);
    const params = [];
    while (!matchOps([OP.Comma, OP.CloseParenthesis])) {
      const expr = parseExpression();
      params.push(expr);
      if (!matchOps([OP.Comma])) {
        break;
      }
      expectOp(OP.Comma);
    }
    expectOp(OP.CloseParenthesis);
    return params;
  };

  // [X-Men] becomes X-Men, "Mutant" becomes Mutant
  const shrink = str => str.substring(1, str.length - 1);

  const field = name => {
    const ref = name[0] === "[" ? shrink(name) : name;
    return ["dimension", unescapeString(ref)];
  };

  // Primary ::= Literal |
  //             Identifier |
  //             FunctionName Parameters |
  //             Group
  const parsePrimary = () => {
    if (matchOps([OP.OpenParenthesis])) {
      return parseGroup();
    }
    const token = next();
    if (!token) {
      throw new Error(t`Unexpected end of input`);
    }
    const { type, start, end } = token;
    if (type === TOKEN.Operator) {
      const text = source.substring(start, end);
      throw new Error(t`Unexpected operator ${text}`);
    }
    const text = source.substring(start, end);
    if (type === TOKEN.Identifier) {
      const peek = tokens[0];
      if (peek && peek.op === OP.OpenParenthesis) {
        const fn = getMBQLName(text.trim().toLowerCase());
        const params = parseParameters();
        return [fn ? fn : text, ...params];
      }
      return field(text);
    } else if (type === TOKEN.Boolean) {
      return text.toLowerCase() === "true" ? true : false;
    }

    // for string literal, remove its enclosing quotes
    return type === TOKEN.String ? shrink(text) : parseFloat(text);
  };

  // Unary ::= Primary |
  //           "+" Unary |
  //           "-" Unary
  const parseUnary = () => {
    if (matchOps([OP.Plus, OP.Minus])) {
      const { op } = next();
      const expr = parseUnary();
      return op === OP.Minus && typeof expr === "number" ? -expr : [op, expr];
    }
    return parsePrimary();
  };

  // Multiplicative ::= Unary |
  //                    Multiplicative "*"" Unary |
  //                    Multiplicative "/" Unary
  const parseMultiplicative = () => {
    let expr = parseUnary();
    while (matchOps([OP.Star, OP.Slash])) {
      const { op } = next();
      if (Array.isArray(expr) && expr[0] === op) {
        expr.push(parseUnary());
      } else {
        expr = [op, expr, parseUnary()];
      }
    }
    return expr;
  };

  // Additive ::= Multiplicative |
  //              Additive "+" Multiplicative
  //              Additive "-" Multiplicative

  const parseAdditive = () => {
    let expr = parseMultiplicative();
    while (matchOps([OP.Plus, OP.Minus])) {
      const { op } = next();
      if (Array.isArray(expr) && expr[0] === op) {
        expr.push(parseMultiplicative());
      } else {
        expr = [op, expr, parseMultiplicative()];
      }
    }
    return expr;
  };

  // Comparison ::= Additive |
  //                Comparison COMPARISON_OPS Additive
  const parseComparison = () => {
    let expr = parseAdditive();
    if (matchOps(COMPARISON_OPS)) {
      const { op } = next();
      expr = [op, expr, parseAdditive()];
    }
    return expr;
  };

  // BooleanUnary ::= Comparison |
  //                 "NOT" BooleanUnary
  const parseBooleanUnary = () => {
    if (matchOps([OP.Not])) {
      const { op } = next();
      return [op, parseBooleanUnary()];
    }
    return parseComparison();
  };

  // BooleanAnd ::= BooleanUnary |
  //                BooleanAnd "AND" BooleanUnary
  const parseBooleanAnd = () => {
    let expr = parseBooleanUnary();
    while (matchOps([OP.And])) {
      const { op } = next();
      if (Array.isArray(expr) && expr[0] === op) {
        expr.push(parseBooleanUnary());
      } else {
        expr = [op, expr, parseBooleanUnary()];
      }
    }
    return expr;
  };

  // BooleanOr ::= BooleanAnd |
  //               BooleanOr "OR" BooleanAnd
  const parseBooleanOr = () => {
    let expr = parseBooleanAnd();
    while (matchOps([OP.Or])) {
      const { op } = next();
      if (Array.isArray(expr) && expr[0] === op) {
        expr.push(parseBooleanAnd());
      } else {
        expr = [op, expr, parseBooleanAnd()];
      }
    }
    return expr;
  };

  // Expression ::= BooleanOr
  const parseExpression = () => parseBooleanOr();

  return parseExpression();
}

const modify = (node, transform) => {
  // MBQL clause?
  if (Array.isArray(node) && node.length > 0 && typeof node[0] === "string") {
    const [operator, ...operands] = node;
    return withAST(
      transform([operator, ...operands.map(sub => modify(sub, transform))]),
      node,
    );
  }
  return withAST(transform(node), node);
};

const withAST = (result, expr) => {
  // If this expression comes from the compiler, an object property
  // containing the parent AST node will be included for errors
  if (expr?.node && typeof result.node === "undefined") {
    Object.defineProperty(result, "node", {
      writable: false,
      enumerable: false,
      value: expr.node,
    });
  }
  return result;
};

const NEGATIVE_FILTER_SHORTHANDS = {
  contains: "does-not-contain",
  "is-null": "not-null",
  "is-empty": "not-empty",
};

// ["NOT", ["is-null", 42]] becomes ["not-null",42]
export const useShorthands = tree =>
  modify(tree, node => {
    if (Array.isArray(node) && node.length === 2) {
      const [operator, operand] = node;
      if (operator === OP.Not && Array.isArray(operand)) {
        const [fn, ...params] = operand;
        const shorthand = NEGATIVE_FILTER_SHORTHANDS[fn];
        if (shorthand) {
          return withAST([shorthand, ...params], node);
        }
      }
    }
    return node;
  });

export const adjustOptions = tree =>
  modify(tree, node => {
    if (Array.isArray(node)) {
      const [operator, ...operands] = node;
      if (operands.length > 0) {
        const clause = MBQL_CLAUSES[operator];
        if (clause && clause.hasOptions) {
          if (operands.length === clause.args.length + 1) {
            // the last one holds the function options
            const options = operands[operands.length - 1];

            // HACK: very specific to some string/time functions for now
            if (options === "case-insensitive") {
              operands.pop();
              operands.push({ "case-sensitive": false });
            } else if (options === "include-current") {
              operands.pop();
              operands.push({ "include-current": true });
            }
            return withAST([operator, ...operands], node);
          }
        }
      }
    }
    return node;
  });

// ["case", X, Y, Z] becomes ["case", [[X, Y]], { default: Z }]
export const adjustCase = tree =>
  modify(tree, node => {
    if (Array.isArray(node)) {
      const [operator, ...operands] = node;
      if (operator === "case") {
        const pairs = [];
        const pairCount = operands.length >> 1;
        for (let i = 0; i < pairCount; ++i) {
          const tst = operands[i * 2];
          const val = operands[i * 2 + 1];
          pairs.push([tst, val]);
        }
        if (operands.length > 2 * pairCount) {
          const defVal = operands[operands.length - 1];
          return withAST([operator, pairs, { default: defVal }], node);
        }
        return withAST([operator, pairs], node);
      }
    }
    return node;
  });

export const adjustOffset = tree =>
  modify(tree, node => {
    if (Array.isArray(node)) {
      const [tag, expr, n] = node;
      if (tag === "offset") {
        const opts = {};
        return withAST([tag, opts, expr, n], node);
      }
    }
    return node;
  });

export const adjustBooleans = tree =>
  modify(tree, node => {
    if (Array.isArray(node)) {
      if (node?.[0] === "case") {
        const [operator, pairs, options] = node;
        return [
          operator,
          pairs.map(([operand, value]) => {
            if (!Array.isArray(operand)) {
              return [operand, value];
            }
            const [op, _id, opts] = operand;
            const isBooleanField =
              op === "field" && opts?.["base-type"] === "type/Boolean";
            if (isBooleanField) {
              return withAST([["=", operand, true], value], operand);
            }
            return [operand, value];
          }),
          options,
        ];
      } else {
        const [operator, ...operands] = node;
        const { args = [] } = MBQL_CLAUSES[operator] || {};
        return [
          operator,
          ...operands.map((operand, index) => {
            if (!Array.isArray(operand) || args[index] !== "boolean") {
              return operand;
            }
            const [op, _id, opts] = operand;
            const isBooleanField =
              op === "field" && opts?.["base-type"] === "type/Boolean";
            if (isBooleanField || op === "segment") {
              return withAST(["=", operand, true], operand);
            }
            return operand;
          }),
        ];
      }
    }
    return node;
  });

const pipe =
  (...fns) =>
  x =>
    fns.reduce((v, f) => f(v), x);

export const parse = pipe(
  recursiveParse,
  adjustOptions,
  useShorthands,
  adjustOffset,
  adjustCase,
);
