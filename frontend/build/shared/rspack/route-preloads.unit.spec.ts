import fs from "fs";
import path from "path";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "__support__/state";
import { getRoutes } from "metabase/routes";
import MetabaseSettings from "metabase/utils/settings";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { collectRouteChunks } from "./derive-route-preloads";
import { readRoutes } from "./routes";

/**
 * The route preload manifest is derived by reading source (`routes/`), because
 * a production build has no module environment to run the tree in. Reading
 * source can only miss an idiom it has not been taught, and a missing route is
 * invisible, so the reader is checked against the tree the app really builds.
 *
 * One build of the tree is ground truth, which rests on three invariants:
 *
 * - The tree is identical on every instance: mounting is unconditional and
 *   feature gating happens at render time (`routes.unit.spec.tsx` enforces it).
 * - A gated route carries both of its pages as properties, so one tree exposes
 *   the chunks of every configuration.
 * - A lazy module cannot add tree shape: react-router ignores `path`, `index`
 *   and `children` returned from `route.lazy()`, and the one
 *   `createBrowserRouter` call never passes `patchRoutesOnNavigation`, the only
 *   API that adds routes after the build (asserted below).
 *
 * Together those make the comparison an equality, with no residual
 * configuration space to sweep.
 */

const builtTree = () => {
  const tokenFeatures = createMockTokenFeatures();
  MetabaseSettings.set("token-features", tokenFeatures);
  setupEnterprisePlugins();

  // `getRoutes` wants the app's own store type, which the test store satisfies
  // at runtime but not on paper.
  const store = getStore(mainReducers, {
    settings: createMockSettingsState({ "token-features": tokenFeatures }),
  }) as unknown as Parameters<typeof getRoutes>[0];

  return collectRouteChunks(getRoutes(store));
};

const key = ({ pattern, chunks }: { pattern: string; chunks: string[] }) =>
  `${pattern} -> ${[...chunks].sort().join("+")}`;

const manifestOf = (routes: { pattern: string; chunks: string[] }[]) =>
  [...new Set(routes.map(key))].sort();

const executed = builtTree();
const read = readRoutes(process.cwd());

describe("the route preload manifest", () => {
  it("reads the same routes and chunks from source as the built tree holds", () => {
    const fromSource = manifestOf(
      read.routes.filter((route) => route.chunk !== null),
    );
    const fromTree = manifestOf(executed.routes);

    expect(fromSource).toEqual(fromTree);
  });

  /**
   * A route the reader drops leaves a note naming the construct it could not
   * follow. An empty set here means the reader followed everything, so the
   * equality above compared the full tree rather than the part it understood.
   */
  it("follows every route idiom", () => {
    const idioms = [
      ...new Set(read.notes.map(({ why, what }) => `${why}: ${what}`)),
    ].sort();

    expect(idioms).toEqual([]);
  });

  it("leaves no page in a chunk nothing can name", () => {
    expect(executed.unnamed.map((route) => route.pattern)).toEqual([]);
  });

  /**
   * Reading source reports every route, not only the ones that load a chunk, so
   * a caller can ask what parameters a URL takes. A route type generator would
   * read exactly this.
   */
  it("reads the parameters a URL takes", () => {
    const withParams = read.routes.filter((route) => route.params.length > 0);

    expect(withParams.length).toBeGreaterThan(50);
  });

  /**
   * `patchRoutesOnNavigation` is react-router's one API for adding routes after
   * the tree is built. Every router goes through this module, so keeping the
   * option out of it is what keeps the built tree complete, and the manifest
   * with it.
   */
  it("never patches routes in after the tree is built", () => {
    const createRouter = fs.readFileSync(
      path.join(
        process.cwd(),
        "frontend/src/metabase/router/create-router.tsx",
      ),
      "utf8",
    );

    expect(createRouter).not.toContain("patchRoutesOnNavigation");
  });
});
