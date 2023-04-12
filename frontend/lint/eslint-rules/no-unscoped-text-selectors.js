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
          message: `cy.${name} should be scoped to a container (try using .within())`,
        });
      }
    },
  };
}

const isTestBlock = node => {
  return ["it", "before", "beforeEach"].includes(
    // when it's a plain it() call, we look at the callee name
    node?.parent?.parent?.callee?.name ??
      // when it's got a .only, we need to look at the callee object
      node?.parent?.parent?.callee?.object?.name,
  );
};

const hasDirectParentTestBlock = node => {
  return isTestBlock(findNearestBlockStatement(node));
};

const findNearestBlockStatement = node => {
  if (!node?.parent) {
    return null;
  }
  if (node.parent.type === "BlockStatement") {
    return node.parent;
  }
  return findNearestBlockStatement(node.parent);
};

const isDirectlyChainedOffOfCy = node => {
  return node.parent.object?.name === "cy";
};

const isFindByText = node => {
  return node.name === "findByText";
};

const isContains = node => {
  return node.name === "contains";
};

const isBadFindByText = node => {
  return (
    (isFindByText(node) || isContains(node)) && isDirectlyChainedOffOfCy(node)
  );
};

// eslint-disable-next-line import/no-commonjs
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Flags all top-level cy.findByText and cy.contains calls",
    },
    schema: [], // no options
  },
  create: rule,
};
