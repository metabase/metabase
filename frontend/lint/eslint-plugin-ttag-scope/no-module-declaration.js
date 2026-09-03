/**
 * @fileoverview Rule to forbid ttag usage at module scope.
 *
 * Replaces `ttag/no-module-declaration`. The upstream rule determines scope with
 * `context.getScope()`, which oxlint's plugin shim does not provide, so it throws
 * on every tagged-template file. Here the same question is answered by walking
 * `node.parent`: a node is at module scope when no function, class body or block
 * encloses it.
 *
 * Translations resolved at module scope are baked in before the user's locale is
 * known, so the string never re-translates when the locale changes.
 */

const MESSAGE_TAGGED = "You can't declare ttag variables in a module scope.";
const MESSAGE_CALL = "You can't declare ttag functions in a module scope.";

const TTAG_TAGS = new Set(["t", "jt"]);
const TTAG_FNS = new Set(["gettext", "ngettext"]);

/**
 * Anything that introduces a scope between the node and the Program root.
 */
const SCOPE_NODES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassBody",
  "BlockStatement",
  "StaticBlock",
]);

function isAtModuleScope(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (SCOPE_NODES.has(current.type)) {
      return false;
    }
  }
  return true;
}

/**
 * Only a bare identifier counts, matching the upstream plugin. The contextual
 * form ``c("context").t`...` `` is deliberately not flagged.
 */
function taggedName(tag) {
  return tag.type === "Identifier" ? tag.name : null;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "forbid ttag usage at module scope",
      category: "Possible Errors",
      recommended: true,
    },
    schema: [], // no options
  },
  create: function (context) {
    return {
      TaggedTemplateExpression(node) {
        const name = taggedName(node.tag);
        if (name && TTAG_TAGS.has(name) && isAtModuleScope(node)) {
          context.report({ node, message: MESSAGE_TAGGED });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const name = callee.type === "Identifier" ? callee.name : null;
        if (name && TTAG_FNS.has(name) && isAtModuleScope(node)) {
          context.report({ node, message: MESSAGE_CALL });
        }
      },
    };
  },
};
