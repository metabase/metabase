/**
 * @fileoverview Disallow direct use of:
 * - document.getElementById
 * - document.querySelector
 * - document.getByClassNames
 * - document.getByTagName
 * - document.body
 * - document.documentElement
 * - any property on document.body or document.documentElement
 */

// eslint-disable-next-line import/no-commonjs
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn on direct calls to document querying methods, direct access of document.body/document.documentElement, and any property on those roots",
      category: "Best Practices",
      recommended: false,
    },
    schema: [],
    messages: {
      avoidDirect:
        "Avoid direct access to `{{ access }}`.\n" +
        "Direct `document` usage may break SDK behavior when it is rendered inside a Shadow DOM.\n" +
        "Use `rootElement` that is accessible from `useRootElement` hook.",
    },
  },

  create(context) {
    const QUERY_METHODS = new Set([
      "querySelector",
      "querySelectorAll",
      "getElementById",
      "getElementsByClassName",
      "getElementsByTagName",
    ]);
    const ROOT_PROPS = new Set(["body", "documentElement"]);

    return {
      MemberExpression(node) {
        // 1) document.getElementById(...) etc.
        if (
          node.object.type === "Identifier" &&
          node.object.name === "document" &&
          !node.computed &&
          node.property.type === "Identifier" &&
          QUERY_METHODS.has(node.property.name)
        ) {
          context.report({
            node,
            messageId: "avoidDirect",
            data: { access: `document.${node.property.name}()` },
          });
          return;
        }

        // 2) direct usage of document.body or document.documentElement
        if (
          node.object.type === "Identifier" &&
          node.object.name === "document" &&
          !node.computed &&
          node.property.type === "Identifier" &&
          ROOT_PROPS.has(node.property.name)
        ) {
          context.report({
            node,
            messageId: "avoidDirect",
            data: { access: `document.${node.property.name}` },
          });
          return;
        }

        // 3) any property on document.body.foo or document.documentElement.bar
        if (
          node.object.type === "MemberExpression" &&
          node.object.object.type === "Identifier" &&
          node.object.object.name === "document" &&
          !node.object.computed &&
          node.object.property.type === "Identifier" &&
          ROOT_PROPS.has(node.object.property.name)
        ) {
          const rootName = node.object.property.name;
          const propName =
            !node.computed && node.property.type === "Identifier"
              ? node.property.name
              : "[computed]";
          context.report({
            node,
            messageId: "avoidDirect",
            data: { access: `document.${rootName}.${propName}` },
          });
        }
      },
    };
  },
};
