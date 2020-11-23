import {
  getMBQLName,
  parseDimension,
  parseMetric,
  parseSegment,
  parseStringLiteral,
  parseIdentifierString,
  OPERATOR_PRECEDENCE,
} from "../expressions";

import { ExpressionCstVisitor, parse } from "./parser";

class ExpressionMBQLCompilerVisitor extends ExpressionCstVisitor {
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
    const args = (ctx.arguments || []).map(argument => this.visit(argument));
    return [fn, ...args];
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

  metricExpression(ctx) {
    const metricName = this.visit(ctx.metricName);
    const metric = parseMetric(metricName, this._options);
    if (!metric) {
      throw new Error(`Unknown Metric: ${metricName}`);
    }
    return ["metric", metric.id];
  }
  segmentExpression(ctx) {
    const segmentName = this.visit(ctx.segmentName);
    const segment = parseSegment(segmentName, this._options);
    if (!segment) {
      throw new Error(`Unknown Segment: ${segmentName}`);
    }
    return ["segment", segment.id];
  }
  dimensionExpression(ctx) {
    const dimensionName = this.visit(ctx.dimensionName);
    const dimension = parseDimension(dimensionName, this._options);
    if (!dimension) {
      throw new Error(`Unknown Field: ${dimensionName}`);
    }
    return dimension.mbql();
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

  // FILTERS
  booleanExpression(ctx) {
    return this._collapseOperators(ctx.operands, ctx.operators);
  }

  comparisonExpression(ctx) {
    return [
      ctx.operators[0].image.toLowerCase(),
      this.visit(ctx.operands[0]),
      this.visit(ctx.operands[1]),
    ];
  }
  booleanUnaryExpression(ctx) {
    return [ctx.operators[0].image.toLowerCase(), this.visit(ctx.operands[0])];
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
  const vistor = new ExpressionMBQLCompilerVisitor(options);
  return vistor.visit(cst);
}

export function parseOperators(operands, operators) {
  let initial = operands[0];
  const stack = [];
  for (let i = 1; i < operands.length; i++) {
    const operator = operators[i - 1];
    const operand = operands[i];
    const top = stack[stack.length - 1];
    if (top) {
      if (top[0] === operator) {
        top.push(operand);
      } else {
        const a = OPERATOR_PRECEDENCE[operator];
        const b = OPERATOR_PRECEDENCE[top[0]];
        if (b < a) {
          top[top.length - 1] = [operator, top[top.length - 1], operand];
          stack.push(top[top.length - 1]);
        } else {
          do {
            stack.pop();
          } while (
            stack.length > 0 &&
            OPERATOR_PRECEDENCE[stack[stack.length - 1][0]] > a
          );
          if (stack.length > 0) {
            stack[stack.length - 1].push(operand);
          } else {
            initial = [operator, initial, operand];
            stack.push(initial);
          }
        }
      }
    } else {
      initial = [operator, initial, operand];
      stack.push(initial);
    }
  }
  return initial;
}
