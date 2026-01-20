/**
 * Codemod to add metabase-custom/ prefix to unprefixed custom ESLint rule names
 *
 * Usage:
 *   npx jscodeshift -t prefix-custom-eslint-rules.cjs frontend/src --extensions=js,jsx,ts,tsx
 */

const customRules = [
  "jtag-missing-key",
  "no-color-literals",
  "no-unconditional-metabase-links-render",
  "no-literal-metabase-strings",
  "no-oss-reinitialize-import",
  "no-direct-helper-import",
  "no-locale-with-intl-functions",
  "no-unordered-test-helpers",
  "no-unsafe-element-filtering",
  "no-unscoped-text-selectors",
  "no-external-references-for-sdk-package-code",
];

module.exports = function transformer(file, api) {
  const source = file.source;
  let modified = false;
  let result = source;

  // Pattern to match eslint disable comments
  // Matches: eslint-disable, eslint-disable-line, eslint-disable-next-line
  const eslintCommentPattern = /(\/\/\s*eslint-disable(?:-next-line|-line)?|\/\*\s*eslint-disable(?:-next-line|-line)?)\s+([^*\n]+?)(\s*\*\/|\n|$)/g;

  result = source.replace(eslintCommentPattern, (match, prefix, rules, suffix) => {
    let rulesModified = false;

    // Split the rules part by comma or space
    const updatedRules = rules
      .split(/\s*,\s*|\s+/)
      .map(rule => {
        rule = rule.trim();
        if (!rule) return rule;

        // Check if it's one of our custom rules without prefix
        if (customRules.includes(rule) && !rule.startsWith('metabase-custom/')) {
          rulesModified = true;
          modified = true;
          return `metabase-custom/${rule}`;
        }

        return rule;
      })
      .filter(Boolean);

    if (rulesModified) {
      // Reconstruct the comment
      const joinChar = rules.includes(',') ? ', ' : ' ';
      return `${prefix} ${updatedRules.join(joinChar)}${suffix}`;
    }

    return match;
  });

  return modified ? result : null;
};
