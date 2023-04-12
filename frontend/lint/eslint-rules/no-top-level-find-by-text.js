//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

function rule(context) {
  return {
    Identifier(node) {
      // at the start of analyzing a code path
      if (isFindByText(node) && hasParentTestBlock(node)) {
        context.report({
          node,
          message:
            "You should scope your findByText calls to a container using .within()",
        });
      }
    },
  };
}

const isTestBlock = node => {
  return ["it", "before", "beforeEach"].includes(node?.callee?.name);
};

const hasParentTestBlock = node => {
  // exactly 6 levels up tells us if it's a direct child of a test block
  return isTestBlock(node.parent.parent.parent.parent.parent.parent);
};

const isFindByText = node => {
  return node.name === "findByText";
};
// eslint-disable-next-line import/no-commonjs
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "You should scope your findByText calls to a container using .within()",
    },
    schema: [], // no options
  },
  create: rule,
};
