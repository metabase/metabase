/**
 * @fileoverview Rule to flag deprecated React APIs.
 *
 * Replaces `react/no-deprecated`. oxlint implements the `react` namespace
 * natively and reserves it, so `eslint-plugin-react` cannot be loaded through
 * `jsPlugins`, and oxlint's own react rules do not include this one.
 *
 * Only the deprecations that can still appear in a React 18 codebase are covered;
 * the pre-15 entries in the upstream rule (`React.createClass`, `React.DOM`,
 * `ReactPerf.*`, addons) are long gone from any code that compiles today.
 */

/** Member expressions, matched as `object.property`. */
const DEPRECATED_MEMBERS = new Map([
  [
    "ReactDOM.render",
    "createRoot (https://react.dev/link/switch-to-createroot)",
  ],
  ["ReactDOM.hydrate", "hydrateRoot"],
  ["ReactDOM.unmountComponentAtNode", "root.unmount"],
  ["ReactDOM.findDOMNode", "a ref"],
  ["ReactDOMServer.renderToNodeStream", "renderToPipeableStream"],
  ["React.createClass", "the npm module create-react-class"],
  ["React.PropTypes", "the npm module prop-types"],
  ["React.DOM", "the npm module react-dom-factories"],
]);

/** Class properties / methods on React components. */
const DEPRECATED_LIFECYCLES = new Map([
  ["componentWillMount", "UNSAFE_componentWillMount"],
  ["componentWillReceiveProps", "UNSAFE_componentWillReceiveProps"],
  ["componentWillUpdate", "UNSAFE_componentWillUpdate"],
]);

const message = (name, replacement) =>
  `${name} is deprecated since React 18. Use ${replacement} instead.`;

function memberName(node) {
  if (
    node.object?.type === "Identifier" &&
    node.property?.type === "Identifier" &&
    !node.computed
  ) {
    return `${node.object.name}.${node.property.name}`;
  }
  return null;
}

function keyName(node) {
  if (node.key?.type === "Identifier") {
    return node.key.name;
  }
  if (node.key?.type === "Literal" && typeof node.key.value === "string") {
    return node.key.value;
  }
  return null;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow deprecated React APIs",
      category: "Possible Errors",
      recommended: true,
    },
    schema: [], // no options
  },
  create: function (context) {
    const reportLifecycle = (node) => {
      const name = keyName(node);
      const replacement = name && DEPRECATED_LIFECYCLES.get(name);
      if (replacement) {
        context.report({ node, message: message(name, replacement) });
      }
    };

    return {
      MemberExpression(node) {
        const name = memberName(node);
        const replacement = name && DEPRECATED_MEMBERS.get(name);
        if (replacement) {
          context.report({ node, message: message(name, replacement) });
        }
      },
      MethodDefinition: reportLifecycle,
      PropertyDefinition: reportLifecycle,
    };
  },
};
