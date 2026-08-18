/**
 * @fileoverview Endpoints are injected into the shared `Api` at import time by the file that owns them,
 * so an endpoint exists on the base object only once the owner's file has been evaluated.
 * Reaching one there by name (`Api.endpoints.getX`, `Api.util.upsertQueryEntries`) works only while something else imports the owner,
 * and a side-effect-free build can drop that owner.
 * This reports injection outside owner files and reach-by-name outside the api module and test support.
 */

const micromatch = require("micromatch");

// The base api objects. An owner's slice (`cardApi.endpoints`) is the intended way in and is not tracked.
const DEFAULT_BASE_APIS = [
  { module: "metabase/api", name: "Api" },
  { module: "metabase/api/api", name: "Api" },
  { module: "metabase-enterprise/api", name: "EnterpriseApi" },
  { module: "metabase-enterprise/api/api", name: "EnterpriseApi" },
];

// Cross-owner by design and a no-op when nothing is registered, so they never need the endpoint to exist.
const ALLOWED_UTILS = new Set(["invalidateTags", "resetApiState"]);

const INJECTORS = new Set(["injectEndpoints", "enhanceEndpoints"]);

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow reaching RTK Query endpoints through the base Api object instead of the owning module's exports",
      category: "Best Practices",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          // Both are globs matched against the linted file's path
          allowInjectionIn: {
            type: "array",
            // Where endpoints may be injected: the api module and owner files
            items: { type: "string" },
          },
          allowReachIn: {
            type: "array",
            // Where endpoints may be reached by name: the api module and test support
            items: { type: "string" },
          },
          baseApis: {
            type: "array",
            items: {
              type: "object",
              properties: {
                module: { type: "string" },
                name: { type: "string" },
              },
              required: ["module", "name"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      endpointAccess:
        "Reach endpoints through the owning module's exports (its hooks or api slice), not through the base {{api}} object; endpoints only exist once the owner's file has been evaluated. `{{access}}` reaches them by name.",
      injection:
        "`{{access}}` injects endpoints outside an owner file. Endpoints belong in the module's `api/` folder or `api.ts`, which exports the hooks and the api slice for consumers.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const filename = context.filename || context.getFilename();
    const options = context.options[0] || {};
    const baseApis = options.baseApis || DEFAULT_BASE_APIS;

    // `dot: true` so a checkout under a dotted directory still matches `**`
    const isAllowedIn = (globs = []) =>
      globs.length > 0 && micromatch.isMatch(filename, globs, { dot: true });
    const injectionAllowed = isAllowedIn(options.allowInjectionIn);
    const reachAllowed = isAllowedIn(options.allowReachIn);

    if (injectionAllowed && reachAllowed) {
      return {};
    }

    function judge(property, computed) {
      if (computed || property.type !== "Identifier") {
        return null;
      }
      if (INJECTORS.has(property.name)) {
        return injectionAllowed ? null : "injection";
      }
      if (property.name === "endpoints" || property.name === "util") {
        return reachAllowed ? null : "endpointAccess";
      }
      return null;
    }

    function report(node, messageId, apiName, access) {
      context.report({ node, messageId, data: { api: apiName, access } });
    }

    function checkReference(identifier, apiName) {
      const parent = identifier.parent;
      if (
        parent.type === "MemberExpression" &&
        parent.object === identifier &&
        !parent.computed &&
        parent.property.type === "Identifier"
      ) {
        if (parent.property.name === "util") {
          if (!reachAllowed) {
            checkUtilAccess(parent, apiName);
          }
          return;
        }
        const messageId = judge(parent.property, parent.computed);
        if (messageId != null) {
          report(parent, messageId, apiName, sourceCode.getText(parent));
        }
        return;
      }
      if (
        parent.type === "VariableDeclarator" &&
        parent.init === identifier &&
        parent.id.type === "ObjectPattern"
      ) {
        for (const property of parent.id.properties) {
          if (property.type !== "Property") {
            continue;
          }
          const key = property.key;
          if (key.type !== "Identifier") {
            continue;
          }
          const messageId = judge(key, false);
          if (messageId != null) {
            report(
              property,
              messageId,
              apiName,
              `{ ${key.name} } = ${apiName}`,
            );
          }
        }
      }
    }

    // A bare `Api.util` handed on is reported too, since what it reaches cannot be seen here.
    function checkUtilAccess(utilAccess, apiName) {
      const outer = utilAccess.parent;
      if (
        outer.type === "MemberExpression" &&
        outer.object === utilAccess &&
        !outer.computed &&
        outer.property.type === "Identifier"
      ) {
        if (!ALLOWED_UTILS.has(outer.property.name)) {
          report(outer, "endpointAccess", apiName, sourceCode.getText(outer));
        }
        return;
      }
      report(
        utilAccess,
        "endpointAccess",
        apiName,
        sourceCode.getText(utilAccess),
      );
    }

    return {
      ImportDeclaration(node) {
        const matches = baseApis.filter(
          (entry) => entry.module === node.source.value,
        );
        if (matches.length === 0) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            continue;
          }
          const importedName =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : String(specifier.imported.value);
          if (!matches.some((entry) => entry.name === importedName)) {
            continue;
          }
          for (const variable of sourceCode.getDeclaredVariables(specifier)) {
            for (const reference of variable.references) {
              checkReference(reference.identifier, importedName);
            }
          }
        }
      },
    };
  },
};
