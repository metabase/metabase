/**
 * ------------------------------------------------------------------------------
 *  Rule Definition
 * ------------------------------------------------------------------------------
 */

function getImportNodeLocation(node) {
  return node.source.value;
}

const ADD_COMMENT_MESSAGE =
  'add comment to indicate the reason why this rule needs to be disabled.\nExample: "// eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins."';
const ERROR_MESSAGE =
  "Metabase string must not be used directly.\n\nPlease import `getApplicationName` selector from `metabase/selectors/whitelabel` and use it to render the application name.\n\nOr " +
  ADD_COMMENT_MESSAGE;
const LITERAL_METABASE_STRING_REGEX = /Metabase/;

// eslint-disable-next-line import/no-commonjs
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure that Metabase string literals are not used so whitelabeled names are used instead",
    },
    schema: [], // no options
  },

  create(context) {
    let isGetApplicationNameImported = false;

    /**
     * @typedef DefaultImport
     * @property {true} isDefault
     * @property {string} source
     *
     * @typedef NamedImport
     * @property {string} named
     * @property {string} source
     *
     * @param {object} node
     * @param {DefaultImport|NamedImport} parameter
     */
    function getImportedModuleNode(node, { isDefault, named, source }) {
      if (getImportNodeLocation(node) === source) {
        const variables = context.getDeclaredVariables(node);
        if (isDefault) {
          return variables.find(
            variable => variable.defs[0].node.type === "ImportDefaultSpecifier",
          );
        }

        // Named import
        return variables.find(
          variable =>
            variable.defs[0].node.type === "ImportSpecifier" &&
            variable.name === named,
        );
      }

      return undefined;
    }

    return {
      ImportDeclaration(node) {
        isGetApplicationNameImported = Boolean(
          getImportedModuleNode(node, {
            named: "getApplicationName",
            source: "metabase/selectors/whitelabel",
          }),
        );
      },
      Literal(node) {
        if (
          typeof node.value !== "string" ||
          ["ExportNamedDeclaration", "ImportDeclaration"].includes(
            node.parent.type,
          )
        ) {
          return;
        }

        if (
          LITERAL_METABASE_STRING_REGEX.exec(node.value) &&
          !isGetApplicationNameImported
        ) {
          context.report({
            node,
            message: ERROR_MESSAGE,
          });
        }
      },
      TemplateLiteral(node) {
        const quasis = node.quasis;
        quasis.forEach(quasi => {
          if (
            LITERAL_METABASE_STRING_REGEX.exec(quasi.value.raw) &&
            !isGetApplicationNameImported
          ) {
            context.report({
              node,
              message: ERROR_MESSAGE,
            });
          }
        });
      },
      JSXText(node) {
        if (
          LITERAL_METABASE_STRING_REGEX.exec(node.value) &&
          !isGetApplicationNameImported
        ) {
          context.report({
            node,
            message: ERROR_MESSAGE,
          });
        }
      },
      Program() {
        const comments = context.getSourceCode().getAllComments();

        const ESLINT_DISABLE_BLOCK_REGEX =
          /eslint-disable\s+no-literal-metabase-strings/;
        const ESLINT_DISABLE_LINE_REGEX =
          /eslint-disable-next-line\s+no-literal-metabase-strings/;
        const ALLOWED_ESLINT_DISABLE_LINE_REGEX =
          /eslint-disable-next-line\s+no-literal-metabase-strings -- \w+/;
        comments.forEach(comment => {
          if (ESLINT_DISABLE_BLOCK_REGEX.exec(comment.value)) {
            const { start, end } = comment.loc;
            context.report({
              loc: {
                start: { line: start.line - 1, column: start.column },
                end: { line: end.line - 1, column: end.column },
              },
              message: "Please use inline disable with comments instead.",
            });
          }

          if (
            ESLINT_DISABLE_LINE_REGEX.exec(comment.value) &&
            !ALLOWED_ESLINT_DISABLE_LINE_REGEX.exec(comment.value)
          ) {
            context.report({
              loc: comment.loc,
              message: `Please ${ADD_COMMENT_MESSAGE}`,
            });
          }
        });
      },
    };
  },
};
