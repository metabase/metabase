import _ from "underscore";
import {
  // aggregations:
  getAggregationFromName,
  // dimensions:
  getDimensionFromName,
} from "../expressions";

import { ExpressionCstVisitor, parse } from "./parser";

class ExpressionMBQLCompilerVisitor extends ExpressionCstVisitor {
  constructor(options) {
    super();
    this._options = options;
    this.validateVisitor();
  }

  expression(ctx) {
    return this.visit(ctx.additionExpression);
  }
  aggregation(ctx) {
    return this.visit(ctx.additionExpression);
  }

  additionExpression(ctx) {
    return this._arithmeticExpression(ctx);
  }
  multiplicationExpression(ctx) {
    return this._arithmeticExpression(ctx);
  }
  _arithmeticExpression(ctx) {
    let initial = this.visit(ctx.lhs);
    if (ctx.rhs) {
      for (const index of ctx.rhs.keys()) {
        const operator = ctx.operator[index].image;
        const operand = this.visit(ctx.rhs[index]);
        // collapse multiple consecutive operators into a single MBQL statement
        if (Array.isArray(initial) && initial[0] === operator) {
          initial.push(operand);
        } else {
          initial = [operator, initial, operand];
        }
      }
    }
    return initial;
  }

  aggregationExpression(ctx) {
    const aggregationName = ctx.aggregation[0].image;
    const agg = this._getAggregationForName(aggregationName);
    const args = ctx.call ? this.visit(ctx.call) : [];
    return [agg, ...args];
  }
  nullaryCall(ctx) {
    return [];
  }
  unaryCall(ctx) {
    return [this.visit(ctx.expression)];
  }

  metricExpression(ctx) {
    const metricName = this.visit(ctx.metricName);
    const metric = this._getMetricForName(metricName);
    if (!metric) {
      throw new Error(`Unknown Metric: ${metricName}`);
    }
    return ["metric", metric.id];
  }
  dimensionExpression(ctx) {
    const dimensionName = this.visit(ctx.dimensionName);
    const dimension = this._getDimensionForName(dimensionName);
    if (!dimension) {
      throw new Error(`Unknown Field: ${dimensionName}`);
    }
    return dimension.mbql();
  }

  identifier(ctx) {
    return ctx.Identifier[0].image;
  }
  stringLiteral(ctx) {
    return JSON.parse(ctx.StringLiteral[0].image);
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

  _getDimensionForName(dimensionName) {
    return getDimensionFromName(dimensionName, this._options.query);
  }
  _getMetricForName(metricName) {
    return this._options.query
      .table()
      .metrics.find(
        metric => metric.name.toLowerCase() === metricName.toLowerCase(),
      );
  }
  _getAggregationForName(aggregationName) {
    return getAggregationFromName(aggregationName);
  }
}

export function compile(source, options = {}) {
  if (!source) {
    return [];
  }
  const cst = parse(source, options);
  const vistor = new ExpressionMBQLCompilerVisitor(options);
  return vistor.visit(cst);
}
