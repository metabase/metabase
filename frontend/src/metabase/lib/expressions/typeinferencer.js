import { ExpressionVisitor } from "./visitor";
import { compactSyntaxTree } from "./typechecker";

export function infer(cst, env) {
  class TypeInferer extends ExpressionVisitor {
    constructor(env) {
      super();
      this.env = env;
    }

    numberLiteral() {
      return "number";
    }
    stringLiteral() {
      return "string";
    }

    relationalExpression(ctx) {
      return "boolean";
    }
    logicalOrExpression(ctx) {
      return "boolean";
    }
    logicalAndExpression(ctx) {
      return "boolean";
    }
    logicalNotExpression(ctx) {
      return "boolean";
    }

    additionExpression(ctx) {
      return "number";
    }

    multiplicationExpression(ctx) {
      return "number";
    }

    caseExpression(ctx) {
      const args = ctx.arguments || [];
      const types = args.map(arg => this.visit(arg));
      return types[1];
    }
  }

  const inferencer = new TypeInferer();
  const compactCst = compactSyntaxTree(cst);
  return inferencer.visit(compactCst);
}
