import {
  getMBQLName,
  parseDimension,
  parseMetric,
  parseSegment,
  parseStringLiteral,
  parseIdentifierString,
} from "../expressions";

import { MBQL_CLAUSES } from "./config";
import { ExpressionCstVisitor, parse } from "./parser";
import { resolve } from "./resolver";

const NEGATIVE_FILTER_SHORTHANDS = {
  contains: "does-not-contain",
  "is-null": "not-null",
  "is-empty": "not-empty",
};
class ExpressionMBQLCompilerVisitor extends ExpressionCstVisitor {
  constructor(options) {
    super();
    this.validateVisitor();
    const resolve = (kind, name) => [kind, name];
    this.resolve = options.resolve ? options.resolve : resolve;
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

  booleanExpression(ctx) {
    return this.visit(ctx.expression);
  }
  logicalOrExpression(ctx) {
    return this._collapseOperators(ctx.operands, ctx.operators);
  }
  logicalAndExpression(ctx) {
    return this._collapseOperators(ctx.operands, ctx.operators);
  }
  booleanUnaryExpression(ctx) {
    return this.visit(ctx.expression);
  }
  logicalNotExpression(ctx) {
    const expr = this.visit(ctx.operands[0]);
    if (Array.isArray(expr)) {
      const [fn, ...args] = expr;
      const shorthand = NEGATIVE_FILTER_SHORTHANDS[fn];
      if (shorthand) {
        return [shorthand, ...args];
      }
    }
    return ["not", expr];
  }
  relationalExpression(ctx) {
    return this._collapseOperators(ctx.operands, ctx.operators);
  }

  additionExpression(ctx) {
    return this._collapseOperators(ctx.operands, ctx.operators);
  }
  multiplicationExpression(ctx) {
    return this._collapseOperators(ctx.operands, ctx.operators);
  }

  functionExpression(ctx) {
    const functionName = ctx.functionName[0].image;
    const fn = getMBQLName(functionName);
    if (!fn) {
      throw new Error(`Unknown Function: ${functionName}`);
    }
    const parameters = ctx.arguments || [];
    const options = [];
    const clause = MBQL_CLAUSES[fn];
    if (clause && clause.hasOptions) {
      if (parameters.length === clause.args.length + 1) {
        // the last one holds the function options
        const fnOptions = this.visit(parameters.pop());

        // HACK: very specific to some string/time functions for now
        if (fnOptions === "case-insensitive") {
          options.push({ "case-sensitive": false });
        } else if (fnOptions === "include-current") {
          options.push({ "include-current": true });
        }
      }
    }
    const args = parameters.map(argument => this.visit(argument));
    return [fn, ...args, ...options];
  }

  caseExpression(ctx) {
    const mbql = ["case", []];
    const args = ctx.arguments.map(arg => this.visit(arg));
    for (let i = 0; i < args.length; i++) {
      if (i === args.length - 1) {
        // if there's a single remaining argument it's the default
        mbql.push({ default: args[i] });
      } else {
        // otherwise push a case clause pair (and increment i)
        mbql[1].push([args[i], args[++i]]);
      }
    }
    return mbql;
  }

  identifierExpression(ctx) {
    const name = this.visit(ctx.identifierName);
    return this.resolve(ctx.resolveAs, name);
  }

  identifier(ctx) {
    return ctx.Identifier[0].image;
  }
  identifierString(ctx) {
    return parseIdentifierString(ctx.IdentifierString[0].image);
  }
  stringLiteral(ctx) {
    return parseStringLiteral(ctx.StringLiteral[0].image);
  }
  numberLiteral(ctx) {
    return parseFloat(ctx.NumberLiteral[0].image) * (ctx.Minus ? -1 : 1);
  }
  atomicExpression(ctx) {
    return this.visit(ctx.expression);
  }
  parenthesisExpression(ctx) {
    return this.visit(ctx.expression);
  }

  // HELPERS:

  _collapseOperators(operands, operators) {
    let initial = this.visit(operands[0]);
    for (let i = 1; i < operands.length; i++) {
      const operator = operators[i - 1].image.toLowerCase();
      const operand = this.visit(operands[i]);
      // collapse multiple consecutive operators into a single MBQL statement
      if (Array.isArray(initial) && initial[0] === operator) {
        initial.push(operand);
      } else {
        initial = [operator, initial, operand];
      }
    }
    return initial;
  }

  _getOperators(operators) {
    return (operators || []).map(o => o.image.toLowerCase());
  }
  _getOperands(operands) {
    return (operands || []).map(o => this.visit(o));
  }
}

export function compile({ cst, ...options }) {
  if (!cst) {
    ({ cst } = parse(options));
  }
  const { startRule } = options;

  const stubResolve = (kind, name) => [kind || "dimension", name];
  const vistor = new ExpressionMBQLCompilerVisitor({
    ...options,
    resolve: stubResolve,
  });
  const expr = vistor.visit(cst);

  function resolveMBQLField(kind, name) {
    if (kind === "metric") {
      const metric = parseMetric(name, options);
      if (!metric) {
        throw new Error(`Unknown Metric: ${name}`);
      }
      return ["metric", metric.id];
    } else if (kind === "segment") {
      const segment = parseSegment(name, options);
      if (!segment) {
        throw new Error(`Unknown Segment: ${name}`);
      }
      return ["segment", segment.id];
    } else {
      // fallback
      const dimension = parseDimension(name, options);
      if (!dimension) {
        throw new Error(`Unknown Field: ${name}`);
      }
      return dimension.mbql();
    }
  }

  return resolve(
    expr,
    startRule,
    options.resolve ? options.resolve : resolveMBQLField,
  );
}
