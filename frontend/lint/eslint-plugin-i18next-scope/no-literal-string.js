/**
 * Reports JSX text that was never passed through ttag.
 *
 * Translated copy always reaches the DOM as an expression container
 * (`{t`...`}`), so any JSXText node that still contains a letter is by
 * definition untranslated. That makes the check a single node visitor, with no
 * need to track whether we are inside a translation call.
 *
 * HTML entities are stripped before the check rather than decoded: `&quot;` and
 * `&nbsp;` are punctuation, but their source spelling contains letters, and
 * oxlint hands the rule raw JSXText rather than the decoded value.
 */

const HTML_ENTITY = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

module.exports = {
  meta: {
    type: "problem",
    docs: { description: "disallow untranslated literal strings in JSX" },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node) {
        const text = node.value.replace(HTML_ENTITY, " ").trim();
        if (!/[A-Za-z]/.test(text)) {
          return;
        }
        context.report({
          node,
          message: `disallow literal string: ${text}`,
        });
      },
    };
  },
};
