//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/*
type of links
1. MetabaseSettings.learnUrl(string)
2. MetabaseSettings.docsUrl(string)
3. getDocsUrl selector from "metabase/selectors/settings"
4. getLearnUrl selector from "metabase/selectors/settings"
5. inline string "metabase.com/docs/"
6. inline string "metabase.com/learn/"
*/
function rule(context) {
  return {
    CallExpression(node) {
      if (
        node?.callee?.object?.type === "Identifier" &&
        node?.callee?.object?.name === "MetabaseSettings" &&
        ["learnUrl", "docsUrl"].includes(node?.callee?.property?.name)
      ) {
        const metabaseSettings = node.callee.object;
        const scope = context.getScope(metabaseSettings);
        console.log({ scope });
        if (
          getImportNodeLocation(
            scope.set.get(metabaseSettings.name).defs[0],
          ) === "metabase/lib/settings"
        ) {
          const scopeImports = scope.variables
            .map(variable => variable.defs[0])
            .filter(node => {
              return node.type === "ImportBinding";
            });

          if (
            !scopeImports.some(
              importNode =>
                getImportNodeLocation(importNode) ===
                  "metabase/selectors/whitelabel" &&
                importNode.node.type === "ImportSpecifier" &&
                importNode.name.name === "getShowMetabaseLinks",
            )
          ) {
            console.log("The rule failed");
          }
        }
      }
    },
  };
}

function getImportNodeLocation(node) {
  return node.parent.source.value;
}

// eslint-disable-next-line import/no-commonjs
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure that Metabase links are rendered conditionally using a `show-metabase-links` setting",
    },
    schema: [], // no options
  },
  create: rule,
};
