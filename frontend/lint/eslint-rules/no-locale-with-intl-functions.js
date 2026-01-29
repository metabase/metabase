//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallows providing a locale argument to certain Intl and String methods, since some of our locales (like pt_BR and zh_TW) are noncompliant and may throw a RangeError.",
    },
    messages: {
      noLocalesArgument: "Avoid providing a locales argument to {{method}}.",
      noDisplayNames: "Intl.DisplayNames is not supported in Metabase.",
    },
  },

  create(context) {
    return {
      'NewExpression[callee.object.name="Intl"][callee.property.name=/^(DateTimeFormat|RelativeTimeFormat|ListFormat|NumberFormat|Collator|PluralRules|Segmenter)$/]'(
        node,
      ) {
        if (node.arguments.length > 0) {
          context.report({
            node,
            messageId: "noLocalesArgument",
            data: {
              method: `Intl.${node.callee.property.name}`,
            },
          });
        }
      },
      'CallExpression[callee.object.name="Intl"][callee.property.name=/^(DateTimeFormat|RelativeTimeFormat|ListFormat|NumberFormat|Collator|PluralRules|Segmenter)$/]'(
        node,
      ) {
        if (node.arguments.length > 0) {
          context.report({
            node,
            messageId: "noLocalesArgument",
            data: {
              method: `Intl.${node.callee.property.name}`,
            },
          });
        }
      },
      'CallExpression[callee.property.name="localeCompare"]'(node) {
        const hasLocalesArgument = node.arguments.length > 1;
        if (hasLocalesArgument) {
          context.report({
            node,
            messageId: "noLocalesArgument",
            data: {
              method: `String.${node.callee.property.name}`,
            },
          });
        }
      },
      'NewExpression[callee.object.name="Intl"][callee.property.name="DisplayNames"]'(
        node,
      ) {
        context.report({
          node,
          messageId: "noDisplayNames",
        });
      },
    };
  },
};
