module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require .last() and .eq(<0) to be preceded by a length assertion",
      category: "Possible Errors",
      recommended: false,
    },
    schema: [],
    messages: {
      unexpected:
        'Using .last() or .eq(<0) without checking collection length can lead to flaky tests. Please add .should("have.length", n) or other appropriate assertions before using these methods',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isCallingRiskyMethod(node) && !isPreviousALengthAssertion(node)) {
          context.report({ node, messageId: "unexpected" });
        }
      },
    };
  },
};

function getPreviousInChain(node) {
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.object.type !== "CallExpression"
  ) {
    return null;
  }

  return node.callee.object;
}

function isCallingRiskyMethod(node) {
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.property.type !== "Identifier"
  ) {
    return false;
  }

  const methodName = node.callee.property.name;
  // Only consider methods risky if they're in a Cypress chain context
  const isCypressChain = node.callee.object.type === "CallExpression";

  // Check for last method
  if (methodName === "last") {
    return isCypressChain;
  }

  // Special handling for eq method
  if (methodName === "eq") {
    if (!isCypressChain) {
      return false;
    }

    // Only consider eq risky if the argument is negative
    if (node.arguments.length > 0 && node.arguments[0].type === "Literal") {
      const index = node.arguments[0].value;
      return index < 0; // Only risky if index is negative
    }
    return true; // Consider risky if argument is not a literal (dynamic index)
  }

  return false;
}

function isPreviousALengthAssertion(node) {
  let current = node;
  while (current) {
    current = getPreviousInChain(current);

    if (!current) {
      break;
    }

    if (
      current.callee.type === "MemberExpression" &&
      (current.callee.property.name === "should" ||
        current.callee.property.name === "expect")
    ) {
      const args = current.arguments;
      if (args.length >= 2) {
        const assertion = args[0].value;
        // Check for various length assertion patterns
        const lengthAssertions = [
          "have.length",
          "have.lengthOf",
          "have.length.of",
          "have.length.at.least",
          "have.length.gte",
          "have.length.at.most",
          "have.length.lte",
          "have.length.above",
          "have.length.gt",
          "have.length.below",
          "have.length.lt",
          "have.length.within",
        ];
        if (lengthAssertions.some((pattern) => assertion === pattern)) {
          return true;
        }
      }
    }
  }

  return false;
}
