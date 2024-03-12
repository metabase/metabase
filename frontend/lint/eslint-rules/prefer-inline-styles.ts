// eslint-disable-next-line import/no-commonjs
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "prefer inline styles over '{margin,padding}-{left,right}' and Mantine's equivalent props",
      recommended: false, // TODO: What does this do?
    },
    messages: {
      noForbiddenStyles:
        "The usage of 'margin-left', 'margin-right', 'padding-left', and 'padding-right' is discouraged.",
      noForbiddenProps:
        "The usage of the 'ml', 'mr', 'pl', and 'pr' props from Mantine is discouraged.",
    },
    schema: [], // no options
  },
  create(context) {
    return {
      Identifier(node) {
        if (node.name === "ml") {
          context.report({
            node,
            messageId: "noMlProp",
          });
        }
      },
      Literal(node) {
        if (
          typeof node.value === "string" &&
          node.value.includes("margin-left")
        ) {
          context.report({
            node,
            messageId: "noMarginLeft",
          });
        }
      },
      // JSXAttribute could be checked similarly for Mantine components
      // if you utilize JSX syntax for your components
      JSXAttribute(node) {
        const isDiscouragedStyle =
          node.name.name === "style" &&
          node.value.expression &&
          node.value.expression.properties &&
          (node.value.expression.properties.some(
            prop => prop.key.name === "marginLeft",
          ) ||
            node.value.expression.properties.some(
              prop => prop.key.name === "marginRight",
            ) ||
            node.value.expression.properties.some(
              prop => prop.key.name === "paddingLeft",
            ) ||
            node.value.expression.properties.some(
              prop => prop.key.name === "paddingRight",
            ));
        const isDiscouragedProp =
          node.name.name === "ml" ||
          node.name.name === "mr" ||
          node.name.name === "pl" ||
          node.name.name === "pr";
        if (isDiscouragedProp || isDiscouragedStyle) {
          context.report({
            node,
            messageId: isDiscouragedProp ? "noMlProp" : "noMarginLeft",
          });
        }
      },
    };
  },
};
