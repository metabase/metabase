/* eslint-env node */

/**
 * Which chunk serves which URL, read out of the route files.
 *
 * A page in its own chunk is only requested once `app-main` has downloaded,
 * parsed and run, so its fetch starts hundreds of milliseconds after the
 * document arrives. The backend reads the manifest this produces and writes
 * `<link rel="preload">` into the page it serves, which moves that fetch
 * alongside the download of `app-main` instead of after it.
 *
 * This reads source rather than building the tree. Building it would mean
 * importing the app, which drags in the asset loaders and the compiled
 * ClojureScript, neither of which a production build has on hand.
 * `route-preloads.unit.spec.ts` builds the real tree and checks the two agree.
 */
const ts = require("typescript");

const { coalesce } = require("./coalesce");
const { createResolver } = require("./resolver");
const { createWalker } = require("./walk");

const ROUTES_MODULE = "metabase/routes";
const ROUTES_EXPORT = "getRoutes";

/** The expression a function returns, so its route tree can be walked. */
function returnedExpression(node) {
  if (!node) {
    return null;
  }
  if (node.body && ts.isBlock(node.body)) {
    let returned = null;
    for (const statement of node.body.statements) {
      if (ts.isReturnStatement(statement) && statement.expression) {
        returned = statement.expression;
      }
    }
    return returned;
  }
  return node.body ?? null;
}

/**
 * Every route that loads its page on demand, coalesced into rows.
 *
 * `notes` records what could not be resolved. Those are modal routes and routes
 * a plugin supplies at runtime, both of which are meant to be skipped, so they
 * are reported rather than thrown.
 */
function deriveRoutePreloads(root) {
  const resolver = createResolver(root);
  const { walk } = createWalker(resolver);

  const file = resolver.resolve(ROUTES_MODULE, `${root}/x.ts`);
  if (!file) {
    throw new Error(
      `route-preloads: cannot find ${ROUTES_MODULE} under ${root}`,
    );
  }

  const declaration = resolver.deref(ROUTES_EXPORT, file);
  if (!declaration) {
    throw new Error(`route-preloads: ${ROUTES_MODULE} has no ${ROUTES_EXPORT}`);
  }

  const tree = returnedExpression(declaration.node);
  if (!tree) {
    throw new Error(`route-preloads: ${ROUTES_EXPORT} returns nothing to walk`);
  }

  const routes = [];
  const notes = [];
  walk(tree, declaration.file, "", [], routes, notes);

  return { routes, rows: coalesce(routes), notes };
}

module.exports = { deriveRoutePreloads };
