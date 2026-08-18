/**
 * @fileoverview There is one RTK Query api object per backend (`Api`, and `EnterpriseApi`
 * built on it), because tag invalidation only works within one instance. Endpoints are
 * injected into it at import time by the file that owns them, which exports the hooks and
 * its api slice by name. So an endpoint exists on the base object only once the owner's
 * file has been evaluated, and code that reaches it there by name (`Api.endpoints.getX`,
 * `Api.util.upsertQueryEntries`) works only while something else imports the owner.
 * A side-effect-free api module lets production shake that owner away. This reports
 * member access on a base api binding that reaches endpoints or injects them, outside the
 * `allowIn` locations (the api module, owner files, test support). Tag invalidation
 * through the base object is allowed: it is cross-owner by design and a no-op when no
 * provider is registered.
 */

const micromatch = require("micromatch");

// The base api objects and where they are imported from. Anything else that
// exposes `.endpoints` is an owner's slice, which is the intended way in.
const DEFAULT_BASE_APIS = [
  { module: "metabase/api", name: "Api" },
  { module: "metabase/api/api", name: "Api" },
  { module: "metabase-enterprise/api", name: "EnterpriseApi" },
  { module: "metabase-enterprise/api/api", name: "EnterpriseApi" },
];

// `Api.util` members that neither reach an endpoint nor need one to exist
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
          allowIn: {
            type: "array",
            // Globs, matched against the linted file's path, where the base
            // object may be used freely: the api module, endpoint owners, and
            // test support
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
    const allowIn = options.allowIn || [];
    const baseApis = options.baseApis || DEFAULT_BASE_APIS;

    // `dot: true` so a checkout under a dotted directory still matches `**`
    if (
      allowIn.length > 0 &&
      micromatch.isMatch(filename, allowIn, { dot: true })
    ) {
      return {};
    }

    function judge(property, computed) {
      if (computed || property.type !== "Identifier") {
        return null;
      }
      if (INJECTORS.has(property.name)) {
        return "injection";
      }
      if (property.name === "endpoints") {
        return "endpointAccess";
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
          checkUtilAccess(parent, apiName);
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
          const messageId =
            key.name === "util" ? "endpointAccess" : judge(key, false);
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

    // `Api.util.<name>`: the utils that need the endpoint to exist are reported,
    // a bare `Api.util` handed on is reported too since it cannot be judged.
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
