//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
//
// The following cases are considered errors:
//
// 1. useDocsUrl hook
// 2. getDocsUrl selector from "metabase/selectors/settings"
// 3. getLearnUrl selector from "metabase/selectors/settings"
// 4. inline string "metabase.com/docs/"
// 5. inline string "metabase.com/learn/"
//
// If a link shouldn't be rendered conditionally e.g. it's only show for admins, or is rendered inside admin settings, you need to disable the rule with a reason.
// e.g. "// eslint-disable-next-line no-unconditional-metabase-links-render -- This link only shows for admins."

function getImportNodeLocation(node) {
  return node.source.value;
}

function getParentDeclarationNode(node) {
  if (node.parent.type === "VariableDeclarator" || !node.parent) {
    return node.parent;
  }
  return getParentDeclarationNode(node.parent);
}

const ADD_COMMENT_MESSAGE =
  'add comment to indicate the reason why this rule needs to be disabled.\nExample: "// eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins."';
const ERROR_MESSAGE =
  "Metabase links must be rendered conditionally.\n\nPlease import `getShowMetabaseLinks` selector from `metabase/selectors/whitelabel` and use it to conditionally render Metabase links.\n\nOr " +
  ADD_COMMENT_MESSAGE;

const HOOK_ERROR_MESSAGE =
  "Metabase links must be rendered conditionally.\n\nPlease destructure `showMetabaseLinks` from this hook and use it to conditionally render Metabase links.\n\nOr " +
  ADD_COMMENT_MESSAGE;

const LITERAL_METABASE_URL_REGEX =
  /(metabase\.com\/docs|metabase\.com\/learn)($|\/)/;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure that Metabase links are rendered conditionally using a `show-metabase-links` setting",
    },
    schema: [], // no options
  },

  create(context) {
    let isGetDocsUrlSelectorImported = false;
    let isGetLearnUrlSelectorImported = false;
    let isGetShowMetabaseLinksSelectorImported = false;

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
        const variables = context.sourceCode.getDeclaredVariables(node);
        if (isDefault) {
          return variables.find(
            (variable) =>
              variable.defs[0].node.type === "ImportDefaultSpecifier",
          );
        }

        // Named import
        return variables.find(
          (variable) =>
            variable.defs[0].node.type === "ImportSpecifier" &&
            variable.name === named,
        );
      }

      return undefined;
    }

    return {
      ImportDeclaration(node) {
        if (
          getImportedModuleNode(node, {
            named: "getDocsUrl",
            source: "metabase/selectors/settings",
          })
        ) {
          isGetDocsUrlSelectorImported = true;
        }
        if (
          getImportedModuleNode(node, {
            named: "getLearnUrl",
            source: "metabase/selectors/settings",
          })
        ) {
          isGetLearnUrlSelectorImported = true;
        }
        if (
          getImportedModuleNode(node, {
            named: "getShowMetabaseLinks",
            source: "metabase/selectors/whitelabel",
          })
        ) {
          isGetShowMetabaseLinksSelectorImported = true;
        }
      },
      CallExpression(node) {
        // call `getDocsUrl` selector
        if (
          isGetDocsUrlSelectorImported &&
          !isGetShowMetabaseLinksSelectorImported &&
          node?.callee?.type === "Identifier" &&
          node?.callee?.name === "getDocsUrl"
        ) {
          context.report({
            node,
            message: ERROR_MESSAGE,
          });
        }

        // call `useDocsUrl` hook
        if (
          node?.callee?.type === "Identifier" &&
          node?.callee?.name === "useDocsUrl"
        ) {
          const parentDeclarationNode = getParentDeclarationNode(node);

          const hasShowMetabaseLinksDestructured =
            parentDeclarationNode?.id?.properties?.some(
              (prop) => prop.key.name === "showMetabaseLinks",
            );

          if (!hasShowMetabaseLinksDestructured) {
            context.report({
              node,
              message: HOOK_ERROR_MESSAGE,
            });
          }
        }

        // call `getLearnUrl` selector
        if (
          isGetLearnUrlSelectorImported &&
          !isGetShowMetabaseLinksSelectorImported &&
          node?.callee?.type === "Identifier" &&
          node?.callee?.name === "getLearnUrl"
        ) {
          context.report({
            node,
            message: ERROR_MESSAGE,
          });
        }
      },
      Literal(node) {
        if (typeof node.value !== "string") {
          return;
        }

        if (
          LITERAL_METABASE_URL_REGEX.exec(node.value) &&
          !isGetShowMetabaseLinksSelectorImported
        ) {
          context.report({
            node,
            message: ERROR_MESSAGE,
          });
        }
      },
      TemplateLiteral(node) {
        const quasis = node.quasis;
        quasis.forEach((quasi) => {
          if (
            LITERAL_METABASE_URL_REGEX.exec(quasi.value.raw) &&
            !isGetShowMetabaseLinksSelectorImported
          ) {
            context.report({
              node,
              message: ERROR_MESSAGE,
            });
          }
        });
      },
      Program() {
        const comments = context.sourceCode.getAllComments();

        const ESLINT_DISABLE_BLOCK_REGEX =
          /eslint-disable\s+no-unconditional-metabase-links-render/;
        const ESLINT_DISABLE_LINE_REGEX =
          /eslint-disable-next-line\s+no-unconditional-metabase-links-render/;
        const ALLOWED_ESLINT_DISABLE_LINE_REGEX =
          /eslint-disable-next-line\s+no-unconditional-metabase-links-render -- \w+/;
        comments.forEach((comment) => {
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
