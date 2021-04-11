import { getIn } from "icepick";
import { ngettext, msgid, t } from "ttag";
import { ExpressionVisitor } from "./visitor";
import { CLAUSE_TOKENS } from "./lexer";

export function typeCheck(cst, rootType) {
  class TypeChecker extends ExpressionVisitor {
    constructor() {
      super();
      this.typeStack = [rootType];
      this.errors = [];
    }

    logicalOrExpression(ctx) {
      this.typeStack.unshift("boolean");
      const result = super.logicalOrExpression(ctx);
      this.typeStack.shift();
      return result;
    }
    logicalAndExpression(ctx) {
      this.typeStack.unshift("boolean");
      const result = super.logicalAndExpression(ctx);
      this.typeStack.shift();
      return result;
    }
    logicalNotExpression(ctx) {
      this.typeStack.unshift("boolean");
      const result = super.logicalNotExpression(ctx);
      this.typeStack.shift();
      return result;
    }
    relationalExpression(ctx) {
      this.typeStack.unshift("expression");
      const result = super.relationalExpression(ctx);
      this.typeStack.shift();
      return result;
    }

    caseExpression(ctx) {
      const type = this.typeStack[0];
      const args = ctx.arguments || [];
      if (args.length < 2) {
        this.errors.push({ message: t`CASE expects 2 arguments or more` });
        return [];
      }
      return args.map((arg, index) => {
        // argument 0, 2, 4, ...(even) is always a boolean, ...
        const argType = index & 1 ? type : "boolean";
        // ... except the very last one
        const lastArg = index === args.length - 1;
        this.typeStack.unshift(lastArg ? type : argType);
        const result = this.visit(arg);
        this.typeStack.shift();
        return result;
      });
    }

    functionExpression(ctx) {
      const args = ctx.arguments || [];
      const functionToken = ctx.functionName[0].tokenType;
      const clause = CLAUSE_TOKENS.get(functionToken);
      const name = functionToken.name;
      const expectedArgsLength = clause.args.length;
      if (!clause.multiple && clause.args.length !== args.length) {
        const message = ngettext(
          msgid`Function ${name} expects ${expectedArgsLength} argument`,
          `Function ${name} expects ${expectedArgsLength} arguments`,
          expectedArgsLength,
        );
        this.errors.push({ message });
      } else {
        return args.map((arg, index) => {
          const argType = clause.args[index];
          const genericType =
            argType === "number" || argType === "string"
              ? "expression"
              : argType;
          this.typeStack.unshift(genericType);
          const result = this.visit(arg);
          this.typeStack.shift();
          return result;
        });
      }
    }

    identifierExpression(ctx) {
      const type = this.typeStack[0];
      if (type === "aggregation") {
        ctx.resolveAs = "metric";
      } else if (type === "boolean") {
        ctx.resolveAs = "segment";
      } else {
        ctx.resolveAs = "dimension";
        if (type === "aggregation") {
          throw new Error("Incorrect type for dimension");
        }
      }
      return super.identifierExpression(ctx);
    }

    numberLiteral(ctx) {
      const type = this.typeStack[0];
      if (type === "boolean") {
        const literal = getIn(ctx, ["NumberLiteral", 0, "image"]);
        const message = t`Expecting boolean but found ${literal}`;
        this.errors.push({ message });
      }
    }

    stringLiteral(ctx) {
      const type = this.typeStack[0];
      if (type === "boolean") {
        const literal = getIn(ctx, ["StringLiteral", 0, "image"]);
        const message = t`Expecting boolean but found ${literal}`;
        this.errors.push({ message });
      }
    }
  }
  const checker = new TypeChecker();
  const compactCst = compactSyntaxTree(cst);
  checker.visit(compactCst);
  return { typeErrors: checker.errors };
}

/*

  Create a copy of the syntax tree where the unnecessary intermediate nodes
  are not present anymore.

  Example:
  For a simple expression "42", the syntax tree produced by the parser is

  expression <-- this is the root node
    relationalExpression
      additionExpression
        multiplicationExpression
          atomicExpression
            numberLiteral

  Meanwhile, the compact variant of the syntax tree:

    numberLiteral

*/

export function compactSyntaxTree(node) {
  if (!node) {
    return;
  }
  const { name, children } = node;

  switch (name) {
    case "any":
    case "aggregation":
    case "atomicExpression":
    case "boolean":
    case "booleanExpression":
    case "booleanUnaryExpression":
    case "expression":
    case "parenthesisExpression":
    case "string":
      if (children.expression) {
        const expression = children.expression.map(compactSyntaxTree);
        return expression.length === 1
          ? expression[0]
          : { name, children: { expression: expression } };
      }
      break;

    case "logicalNotExpression":
      if (children.operands) {
        const operands = children.operands.map(compactSyntaxTree);
        const operators = children.operators;
        return { name, children: { operators, operands } };
      }
      break;

    case "additionExpression":
    case "multiplicationExpression":
    case "logicalAndExpression":
    case "logicalOrExpression":
    case "relationalExpression":
      if (children.operands) {
        const operands = children.operands.map(compactSyntaxTree);
        const operators = children.operators;
        return operands.length === 1
          ? operands[0]
          : { name, children: { operators, operands } };
      }
      break;

    case "functionExpression":
    case "caseExpression": {
      const { functionName, LParen, RParen } = children;
      const args = children.arguments
        ? children.arguments.map(compactSyntaxTree)
        : [];
      return {
        name,
        children: { functionName, arguments: args, LParen, RParen },
      };
    }

    default:
      break;
  }

  return { name, children };
}
