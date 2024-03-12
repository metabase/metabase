// eslint-disable-next-line import/no-commonjs
module.exports = {
  meta: {
    // TODO: Add border-left and border-right (prefer border-inline-start and border-inline-end)
    type: "suggestion",
    docs: {
      description:
        "prefer inline styles over '{margin,padding}-{left,right}', 'right:', 'left:', and Mantine's equivalent props",
      recommended: false, // TODO: What does this do?
    },
    messages: {
      noDiscouragedPaddingOrMarginStyles:
        "The usage of 'margin-left', 'margin-right', 'padding-left', and 'padding-right' is discouraged.",
      noDiscouragedProps:
        "The usage of the 'ml', 'mr', 'pl', and 'pr' props from Mantine is discouraged. Use the props that honor the writing-direction, such as mld, mrd, pld, and prd.",
      noDiscouragedPositioningStyles:
        "The usage of the css properties 'left' and 'right' is discouraged. Use 'inset-inline-start' and 'inset-inline-end' instead.",
    },
    schema: [], // no options
  },
  create(context) {
    return {
      Identifier(node) {
        if (
          node.name === "ml" ||
          node.name === "mr" ||
          node.name === "pl" ||
          node.name === "pr"
        ) {
          context.report({
            node,
            messageId: "noDiscouragedProps",
          });
        }
      },
      Literal(node) {
        if (
          typeof node.value === "string" &&
          (node.value.includes("margin-left") ||
            node.value.includes("margin-right") ||
            node.value.includes("padding-left") ||
            node.value.includes("padding-right"))
        ) {
          context.report({
            node,
            messageId: "noDiscouragedPaddingOrMarginStyles",
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
            messageId: isDiscouragedProp
              ? "noDiscouragedProps"
              : "noDiscouragedPaddingOrMarginStyles",
          });
        }
      },
    };
  },
};
