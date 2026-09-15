import { settingsForFile } from "./config.mjs";

// Oxlint parses import-free JS files as scripts, where local bindings can appear to redeclare globals.
// Our policy treats those bindings as module-local.
export function moduleScopeContext(context) {
  const sourceCode = context.sourceCode;
  if (
    sourceCode.ast.sourceType !== "script" ||
    settingsForFile(context.filename).sourceType !== "module"
  )
    return context;
  const views = new WeakMap();
  const getScope = (node) => {
    const scope = sourceCode.getScope(node);
    if (scope.type !== "global") return scope;
    if (!views.has(scope)) {
      views.set(
        scope,
        Object.create(scope, {
          variables: {
            value: scope.variables.map((variable) =>
              variable.identifiers.length
                ? Object.create(variable, {
                    eslintImplicitGlobalSetting: { value: undefined },
                  })
                : variable,
            ),
          },
        }),
      );
    }
    return views.get(scope);
  };
  return Object.create(context, {
    sourceCode: {
      value: Object.create(sourceCode, { getScope: { value: getScope } }),
    },
  });
}
