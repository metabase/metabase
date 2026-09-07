import { settingsForFile } from "./config.mjs";

// Oxlint parses import-free .js files as scripts, while our ESLint policy treats
// them as modules. A module's own bindings do not redeclare ambient globals.
// Preserve syntax redeclarations by retaining every declared identifier; only
// hide the ambient-global annotation on those module-local bindings.
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
