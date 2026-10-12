const SLOT_NAME = /^PLUGIN_[A-Z0-9_]+$/;
const ROUTE_MEMBER = /Routes$|Page$|ROUTES$/;
const FEATURE_TESTS = new Set(["hasPremiumFeature", "hasAnyPremiumFeature"]);
const { ROUTE_GATE_STRENGTH } = require("../../../build/shared/rspack/route-gate-strength");

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A write to a route-bearing plugin slot may be guarded by at most ROUTE_GATE_STRENGTH premium features, so the preload sweep can cover every combination that selects a route",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      tooManyFeatures:
        "`{{slot}}` is written under a condition testing {{count}} premium features ({{features}}). The preload sweep covers combinations of {{limit}} at a time, so either split the writes or raise ROUTE_GATE_STRENGTH and the sweep with it.",
      unreadableFeature:
        "`{{slot}}` is written under `{{callee}}(...)` with a non-literal feature name, so no check can tell which feature gates the route. Pass a string literal.",
    },
  },
  create(context) {
    const report = (node, slot) => {
      const features = new Set();
      let unreadable = null;

      for (const test of guardsOf(node)) {
        for (const call of featureCalls(test)) {
          const [argument] = call.arguments;
          if (argument?.type === "Literal" && typeof argument.value === "string") {
            features.add(argument.value);
          } else {
            unreadable = call;
          }
        }
      }

      if (unreadable) {
        context.report({
          node: unreadable,
          messageId: "unreadableFeature",
          data: { slot, callee: calleeName(unreadable) },
        });
        return;
      }

      if (features.size > ROUTE_GATE_STRENGTH) {
        context.report({
          node,
          messageId: "tooManyFeatures",
          data: {
            slot,
            limit: ROUTE_GATE_STRENGTH,
            count: features.size,
            features: [...features].sort().join(", "),
          },
        });
      }
    };

    return {
      AssignmentExpression(node) {
        const slot = routeSlotName(node.left);
        if (slot) {
          report(node, slot);
        }
      },
      CallExpression(node) {
        // `PLUGIN_X.push(getRoutes)` fills an array-shaped slot.
        if (
          node.callee.type === "MemberExpression" &&
          !node.callee.computed &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "push" &&
          node.callee.object.type === "Identifier" &&
          SLOT_NAME.test(node.callee.object.name) &&
          ROUTE_MEMBER.test(node.callee.object.name)
        ) {
          report(node, node.callee.object.name);
        }
      },
    };
  },
};

// `PLUGIN_X.getFooRoutes` or `PLUGIN_X.fooPage`.
function routeSlotName(target) {
  if (
    target.type !== "MemberExpression" ||
    target.computed ||
    target.object.type !== "Identifier" ||
    target.property.type !== "Identifier"
  ) {
    return null;
  }
  if (
    !SLOT_NAME.test(target.object.name) ||
    !ROUTE_MEMBER.test(target.property.name)
  ) {
    return null;
  }
  return `${target.object.name}.${target.property.name}`;
}

/** Every condition the node sits inside, innermost first. */
function guardsOf(node) {
  const tests = [];
  let child = node;
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (parent.type === "IfStatement" && parent.test !== child) {
      tests.push(parent.test);
    }
    if (parent.type === "ConditionalExpression" && parent.test !== child) {
      tests.push(parent.test);
    }
    // `feature && write()` guards the right side only.
    if (parent.type === "LogicalExpression" && parent.right === child) {
      tests.push(parent.left);
    }
  }
  return tests;
}

function featureCalls(root) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node.type !== "string") {
      return;
    }
    if (node.type === "CallExpression" && FEATURE_TESTS.has(calleeName(node))) {
      found.push(node);
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") {
        continue;
      }
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value.type === "string") {
        visit(value);
      }
    }
  };
  visit(root);
  return found;
}

function calleeName(call) {
  if (call.callee.type === "Identifier") {
    return call.callee.name;
  }
  if (call.callee.type === "MemberExpression" && !call.callee.computed) {
    return call.callee.property.name;
  }
  return null;
}
