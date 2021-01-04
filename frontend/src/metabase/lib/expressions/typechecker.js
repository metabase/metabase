import { ExpressionVisitor } from "./visitor";

export function typeCheck(cst, rootType) {
  class TypeChecker extends ExpressionVisitor {
    constructor() {
      super();
      this.typeStack = [rootType];
    }

    expression(ctx) {
      this.typeStack.unshift(rootType);
      const result = super.expression(ctx);
      this.typeStack.shift();
      return result;
    }
    aggregation(ctx) {
      this.typeStack.unshift("aggregation");
      const result = super.aggregation(ctx);
      this.typeStack.shift();
      return result;
    }
    boolean(ctx) {
      this.typeStack.unshift("boolean");
      const result = super.boolean(ctx);
      this.typeStack.shift();
      return result;
    }

    // TODO check for matching argument signature
    functionExpression(ctx) {
      const args = ctx.arguments || [];
      return args.map(arg => {
        this.typeStack.unshift("expression");
        const result = this.visit(arg);
        this.typeStack.unshift();
        return result;
      });
    }

    metricExpression(ctx) {
      const type = this.typeStack[0];
      if (type !== "aggregation" && type !== "expression") {
        throw new Error("Incorrect type for metric");
      }
      return super.metricExpression(ctx);
    }

    segmentExpression(ctx) {
      const type = this.typeStack[0];
      if (type !== "boolean") {
        throw new Error("Incorrect type for segment");
      }
      return super.segmentExpression(ctx);
    }

    dimensionExpression(ctx) {
      const type = this.typeStack[0];
      if (type === "boolean" || type === "aggregation") {
        throw new Error("Incorrect type for dimension");
      }
      return super.dimensionExpression(ctx);
    }

    booleanExpression(ctx) {
      const type = ctx.operands.length > 1 ? rootType : this.typeStack[0];
      this.typeStack.unshift(type);
      const result = super.booleanExpression(ctx);
      this.typeStack.shift();
      return result;
    }
    comparisonExpression(ctx) {
      this.typeStack.unshift("expression");
      const result = super.comparisonExpression(ctx);
      this.typeStack.shift();
      return result;
    }
    booleanUnaryExpression(ctx) {
      const type = ctx.operands.length > 1 ? rootType : this.typeStack[0];
      this.typeStack.unshift(type);
      const result = super.booleanUnaryExpression(ctx);
      this.typeStack.shift();
      return result;
    }
  }
  new TypeChecker().visit(cst);
}
