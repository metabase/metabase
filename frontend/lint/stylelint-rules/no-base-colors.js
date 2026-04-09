import stylelint from "stylelint";

const ruleName = "metabase/no-base-colors";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (variable) =>
    `You cannot use a base color: "${variable}" in this file. Define a semantic color in colors.module.css instead.`,
});

/** @type {import('stylelint').Rule} */
const ruleFunction = (primary, secondaryOptions, context) => {
  return (root, result) => {
    // you're allowed to use base colors in colors.module.css
    if (root.source.input.file.includes("colors.module.css")) {
      return;
    }
    const validOptions = stylelint.utils.validateOptions(result, ruleName, {
      actual: primary,
      possible: [true],
    });

    if (!validOptions) {
      return;
    }

    // Check CSS custom property declarations (--variable: value)
    root.walkDecls((decl) => {
      if (decl.prop.startsWith("--mb-base-color")) {
        stylelint.utils.report({
          message: messages.rejected(decl.prop),
          node: decl,
          result,
          ruleName,
        });
      }
    });

    // Check usage of CSS variables in values (var(--mb-base-color-*))
    root.walkDecls((decl) => {
      const varRegex = /var\(\s*(--mb-base-color[^,\)]*)/g;
      let match;

      while ((match = varRegex.exec(decl.value)) !== null) {
        const variableName = match[1];

        stylelint.utils.report({
          message: messages.rejected(variableName),
          node: decl,
          result,
          ruleName,
        });
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default stylelint.createPlugin(ruleName, ruleFunction);
