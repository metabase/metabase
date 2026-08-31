import { type ReactNode, isValidElement } from "react";

import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { type RouteObject, toRouteObjects } from "metabase/router";

import { getRoutes } from "./routes";
import { getSettingsRoutes } from "./settingsRoutes";

/**
 * These routes name their page in an `import()` rather than importing it, so
 * nothing type-checks the path or the export any more, and nothing renders the
 * admin tree in a test. A typo would first show up as a blank admin page.
 * Resolving every loader is the cheap guard against that.
 */
function lazyLoaders(tree: ReactNode) {
  const loaders: (() => Promise<{ Component?: unknown }>)[] = [];

  const collect = (routes: RouteObject[]) => {
    for (const route of routes) {
      if (typeof route.lazy === "function") {
        loaders.push(route.lazy);
      }
      collect(route.children ?? []);
    }
  };

  collect(toRouteObjects(tree));
  return loaders;
}

/**
 * Every path-carrying route whose element navigates elsewhere, as written path
 * -> target. Read off the route table rather than by navigating, so one test
 * covers the section instead of a spec per redirected page. Index redirects
 * have no path of their own and are not collected.
 */
function navigationTargets(tree: ReactNode) {
  const targets: Record<string, string> = {};

  const collect = (routes: RouteObject[]) => {
    for (const route of routes) {
      const element = route.element;

      if (route.path && isValidElement<{ to?: string }>(element)) {
        const { to } = element.props;

        if (typeof to === "string") {
          targets[route.path] = to;
        }
      }

      collect(route.children ?? []);
    }
  };

  collect(toRouteObjects(tree));
  return targets;
}

function isRetiredEmbeddingPath(path: string) {
  return (
    path.startsWith("/admin/embedding") ||
    path.startsWith("/admin/settings/embedding-in-other-applications")
  );
}

const Guard = () => null;

// A real store: `getRoutes` reads a setting off it to decide whether the custom
// visualisation development route exists at all.
function createStore() {
  return getStore(mainReducers, {
    settings: createMockSettingsState({
      "custom-viz-plugin-dev-mode-enabled": true,
    }),
  });
}

describe("admin routes", () => {
  it("resolves every page in the admin tree", async () => {
    const loaders = lazyLoaders(getRoutes(createStore(), Guard, Guard));

    expect(loaders.length).toBeGreaterThan(30);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  it("redirects every retired embedding path to its hub equivalent", () => {
    const targets = navigationTargets(getRoutes(createStore(), Guard, Guard));

    expect(targets).toMatchObject({
      "/admin/embedding": "/embedding/security",
      "/admin/embedding/setup-guide": "/embedding",
      "/admin/embedding/setup-guide/permissions":
        "/embedding/get-started/permissions-setup",
      "/admin/embedding/setup-guide/sso": "/embedding/get-started/sso-setup",
      "/admin/embedding/guest": "/embedding/security",
      "/admin/embedding/security": "/embedding/security",
      "/admin/embedding/themes": "/embedding/appearance",
      "/admin/embedding/themes/:themeId":
        "/embedding/appearance/theme/:themeId",
      "/admin/embedding/modular": "/embedding/security",
      "/admin/embedding/interactive": "/embedding/security",
      "/admin/settings/embedding-in-other-applications": "/embedding/security",
      "/admin/settings/embedding-in-other-applications/full-app":
        "/embedding/security",
      "/admin/settings/embedding-in-other-applications/standalone":
        "/embedding/security",
      "/admin/settings/embedding-in-other-applications/sdk":
        "/embedding/security",
    });
  });

  it("sends every retired embedding path straight to the hub, never to another redirect", () => {
    const targets = navigationTargets(getRoutes(createStore(), Guard, Guard));

    const chained = Object.entries(targets).filter(
      ([path, to]) => isRetiredEmbeddingPath(path) && targets[to] !== undefined,
    );

    expect(chained).toEqual([]);
  });

  it("resolves every page in the settings tree", async () => {
    const loaders = lazyLoaders(getSettingsRoutes(createStore(), Guard));

    expect(loaders.length).toBeGreaterThan(20);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
