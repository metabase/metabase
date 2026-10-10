/* eslint-env node */

/**
 * The app's route tree, read out of source.
 *
 * Building the tree instead would mean importing the app, which needs the asset
 * loaders and the compiled ClojureScript, and a production build has neither on
 * hand. Reading source needs nothing but the files.
 *
 * Every route is reported, with the chunk that serves it when it has one and the
 * parameters its URL takes. Callers filter for what they need: preload hints
 * want the routes with a chunk, a type generator wants the patterns and their
 * parameters.
 *
 * Reading source can only miss an idiom it has not been taught, and a missing
 * route is invisible. `route-preloads.unit.spec.ts` builds the real tree and
 * fails when this misses anything it finds.
 */
const ts = require("typescript");

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
 * @returns {{ routes: Array<{
 *   pattern: string,
 *   params: string[],
 *   chunks: string[],
 *   chunk: string | null,
 *   isLazy: boolean,
 *   file: string,
 * }>, notes: Array<{ why: string, what: string, file: string }> }}
 *
 * `notes` records what could not be resolved. Modal routes and routes a plugin
 * supplies at runtime are both meant to be skipped, so they are reported rather
 * than thrown.
 */
function readRoutes(root) {
  const resolver = createResolver(root);
  const { walk } = createWalker(resolver);

  const file = resolver.resolve(ROUTES_MODULE, `${root}/x.ts`);
  if (!file) {
    throw new Error(`routes: cannot find ${ROUTES_MODULE} under ${root}`);
  }

  const declaration = resolver.deref(ROUTES_EXPORT, file);
  if (!declaration) {
    throw new Error(`routes: ${ROUTES_MODULE} has no ${ROUTES_EXPORT}`);
  }

  const tree = returnedExpression(declaration.node);
  if (!tree) {
    throw new Error(`routes: ${ROUTES_EXPORT} returns nothing to walk`);
  }

  const routes = [];
  const notes = [];
  walk(tree, declaration.file, "", [], routes, notes);

  return { routes, notes };
}

module.exports = { readRoutes };
