/**
 * @fileoverview Rule to enforce H.restore() must come before H.resetTestTable()
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const ERROR_MESSAGE = "H.restore() must come before H.resetTestTable()";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce H.restore() must be called before H.resetTestTable()",
    },
    schema: [], // no options
  },
  create(context) {
    const stack = [{ hasRestore: false }];

    return {
      // Push new scope for describe blocks
      "CallExpression[callee.name='describe']"() {
        stack.push({ hasRestore: stack[stack.length - 1].hasRestore });
      },

      // Pop scope when leaving describe blocks
      "CallExpression[callee.name='describe']:exit"() {
        stack.pop();
      },

      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.name === "H"
        ) {
          const currentScope = stack[stack.length - 1];

          if (node.callee.property.name === "restore") {
            currentScope.hasRestore = true;
          } else if (node.callee.property.name === "resetTestTable") {
            const hasRestoreInHierarchy = stack.some(
              (scope) => scope.hasRestore,
            );

            if (!hasRestoreInHierarchy) {
              context.report({
                node,
                message: ERROR_MESSAGE,
              });
            }
          }
        }
      },

      // Reset state for each test file
      Program() {
        stack.length = 1;
        stack[0] = { hasRestore: false };
      },
    };
  },
};
