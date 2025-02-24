import { t } from "ttag";

import { getMBQLName } from "./config";
import {
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
  useShorthands,
} from "./passes";
import { unescapeString } from "./string";
import { OPERATOR as OP, TOKEN, tokenize } from "./tokenizer";

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
  const expectOp = (nextOp, nextOpName) => {
    const token = next();
    if (!token) {
      throw new Error(t`Unexpected end of input, expecting ${nextOpName}`);
    }
    const { type, op, start, end } = token;
    if (type !== TOKEN.Operator || op !== nextOp) {
      const text = source.substring(start, end);
      throw new Error(t`Expecting ${nextOpName} but got ${text} instead`);
    }
  };

  // Return true if the next token is one of the specified operators
  const matchOps = ops =>
    tokens.length > 0 &&
    tokens[0].type === TOKEN.Operator &&
    ops.includes(tokens[0].op);

  // Group ::= "(" Expression ")"
  const parseGroup = () => {
    expectOp(OP.OpenParenthesis, t`opening parenthesis`);
    const expr = parseExpression();
    const terminated = matchOps([OP.CloseParenthesis]);
    expectOp(OP.CloseParenthesis, t`closing parenthesis`);
    if (!terminated) {
      throw new Error(t`Expecting a closing parenthesis`);
    }
    return expr;
  };

  // Parameters ::= "(" * Expression ")"
  const parseParameters = () => {
    expectOp(OP.OpenParenthesis, t`opening parenthesis`);
    const params = [];
    while (!matchOps([OP.Comma, OP.CloseParenthesis])) {
      const expr = parseExpression();
      params.push(expr);
      if (!matchOps([OP.Comma]) && matchOps([OP.CloseParenthesis])) {
        break;
      }
      expectOp(OP.Comma, t`comma`);
    }
    expectOp(OP.CloseParenthesis, t`closing parenthesis`);
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

const pipe =
  (...fns) =>
  x =>
    fns.reduce((v, f) => f(v), x);

export const parse = pipe(
  recursiveParse,
  adjustOptions,
  useShorthands,
  adjustOffset,
  adjustCaseOrIf,
  adjustMultiArgOptions,
);
