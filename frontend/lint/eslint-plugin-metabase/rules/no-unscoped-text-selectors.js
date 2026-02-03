//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

function rule(context) {
  return {
    Identifier(node) {
      if (isBadFindByText(node) && hasDirectParentTestBlock(node)) {
        const name = isContains(node) ? "contains" : "findByText";

        context.report({
          node,
          message: `cy.${name} should be scoped to a container (try using .within())
Valid usage:
- cy.contains('.selector', 'text')
- cy.get('.selector').${name}('text')
- cy.within(() => cy.${name}('text'))`,
        });
      }
    },
  };
}

const isTestBlock = (node) => {
  return ["it", "before", "beforeEach"].includes(
    // when it's a plain it() call, we look at the callee name
    node?.parent?.parent?.callee?.name ??
      // when it's got a .only, we need to look at the callee object
      node?.parent?.parent?.callee?.object?.name,
  );
};

const hasDirectParentTestBlock = (node) => {
  return isTestBlock(findNearestBlockStatement(node));
};

const findNearestBlockStatement = (node) => {
  if (!node?.parent) {
    return null;
  }
  if (node.parent.type === "BlockStatement") {
    return node.parent;
  }
  return findNearestBlockStatement(node.parent);
};

const isDirectlyChainedOffOfCy = (node) => {
  // Check if it's directly chained off cy (cy.contains())
  if (node.parent.object?.name === "cy") {
    return true;
  }

  // If it's not directly off cy, it's allowed (e.g. cy.get().contains())
  return false;
};

const isFindByText = (node) => {
  return node.name === "findByText";
};

const isContains = (node) => {
  return node.name === "contains";
};

const isBadFindByText = (node) => {
  if (isFindByText(node) && isDirectlyChainedOffOfCy(node)) {
    return true;
  }

  if (isContains(node) && isDirectlyChainedOffOfCy(node)) {
    // Get the CallExpression node which contains the arguments
    const callExpression = node.parent.parent;
    if (!callExpression || callExpression.type !== "CallExpression") {
      return false;
    }

    // If there's only one argument, it's bad
    if (callExpression.arguments.length === 1) {
      return true;
    }

    // If there are two arguments but the second one is an object, treat it like a single argument
    if (
      callExpression.arguments.length === 2 &&
      callExpression.arguments[1].type === "ObjectExpression"
    ) {
      return true;
    }

    return false;
  }

  return false;
};

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Flags unscoped cy.findByText calls and single-argument cy.contains calls. Valid examples: cy.contains('.selector', 'text'), cy.get('.selector').contains('text'), cy.within(() => cy.contains('text')). Invalid examples: cy.contains('text'), cy.findByText('text')",
    },
    schema: [], // no options
  },
  create: rule,
};
