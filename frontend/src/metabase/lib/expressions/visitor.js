export class ExpressionVisitor {
  visit(node) {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      node = node[0];
    }
    if (!this[node.name]) {
      console.error(node);
      throw new Error(`ExpressionVisitor: missing ${node.name}`);
    }
    return this[node.name](node.children, node);
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
    return (ctx.operands || []).map(operand => this.visit(operand));
  }
  multiplicationExpression(ctx) {
    return (ctx.operands || []).map(operand => this.visit(operand));
  }

  functionExpression(ctx) {
    return (ctx.arguments || []).map(argument => this.visit(argument));
  }
  caseExpression(ctx) {
    return (ctx.arguments || []).map(argument => this.visit(argument));
  }

  metricExpression(ctx) {
    return this.visit(ctx.metricName);
  }
  dimensionExpression(ctx) {
    return this.visit(ctx.dimensionName);
  }

  identifier(ctx) {
    return (ctx.Identifier || []).map(id => id.image);
  }
  identifierString(ctx) {
    return (ctx.IdentifierString || []).map(id => id.image);
  }
  stringLiteral(ctx) {
    return (ctx.StringLiteral || []).map(id => id.image);
  }
  numberLiteral(ctx) {
    return (ctx.NumberLiteral || []).map(id => id.image);
  }
  atomicExpression(ctx) {
    return this.visit(ctx.expression);
  }
  parenthesisExpression(ctx) {
    return this.visit(ctx.expression);
  }

  booleanExpression(ctx) {
    return (ctx.operands || []).map(operand => this.visit(operand));
  }

  comparisonExpression(ctx) {
    return (ctx.operands || []).map(operand => this.visit(operand));
  }
  booleanUnaryExpression(ctx) {
    return (ctx.operands || []).map(operand => this.visit(operand));
  }
}

// only for troubleshooting or debugging
export function prettyPrint(cst) {
  class Formatter extends ExpressionVisitor {
    constructor() {
      super();
      this.indent = 0;
    }
    visit(node) {
      console.log(
        "  ".repeat(this.indent),
        Array.isArray(node) ? node[0].name : node.name,
      );
      ++this.indent;
      const result = super.visit(node);
      --this.indent;
      return result;
    }
  }
  new Formatter().visit(cst);
}
