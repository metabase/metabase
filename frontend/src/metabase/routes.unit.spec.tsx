import { act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { getStore, mainReducers } from "__support__/entities-store";
import {
  setupCurrentUserEndpoint,
  setupDashboardQuestionCandidatesEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderRoutes, renderWithProviders, screen } from "__support__/ui";
import { setup as setupAccountPassword } from "metabase/account/password/containers/UserPasswordApp/tests/setup";
import { getUser } from "metabase/current-user";
import { PLUGIN_AUDIT, reinitialize } from "metabase/plugins";
import { Route, type RouteObject } from "metabase/router";
import { defer } from "metabase/utils/promise";
import MetabaseSettings from "metabase/utils/settings";
import type { TokenFeatures, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { LegacyBrowseRedirect, getRoutes } from "./routes";

function setupLegacyBrowseRedirect(initialRoute: string) {
  setupCurrentUserEndpoint(createMockUser());

  const { router } = renderWithProviders(
    <Route path="browse">
      <Route path="databases/:slug" element={<div>browse databases</div>} />
      <Route path=":dbIdAndSlug" element={<LegacyBrowseRedirect />} />
    </Route>,
    { withRouter: true, initialRoute },
  );

  return router;
}

describe("LegacyBrowseRedirect", () => {
  it("redirects a v48-era /browse/<dbId>-<slug> url onto /browse/databases", async () => {
    const router = setupLegacyBrowseRedirect("/browse/5-orders");

    await waitFor(() =>
      expect(router?.location.pathname).toBe("/browse/databases/5-orders"),
    );
    expect(screen.getByText("browse databases")).toBeInTheDocument();
  });

  it("does not redirect a segment without the legacy hyphenated shape", async () => {
    const router = setupLegacyBrowseRedirect("/browse/orders");

    expect(router?.location.pathname).toBe("/browse/orders");
  });
});

jest.mock("metabase/AppComponent", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    __esModule: true,
    App: () => <Outlet />,
  };
});

jest.mock("metabase/common/components/NotFoundFallbackPage", () => ({
  NotFoundFallbackPage: () => null,
}));

let mockRenderMonitorOutlet = false;

jest.mock("metabase/monitor/components/MonitorLayout", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    MonitorLayout: () => (mockRenderMonitorOutlet ? <Outlet /> : null),
  };
});

jest.mock("metabase/collections/components/CollectionLanding", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return { __esModule: true, default: () => <Outlet /> };
});

function setupAppRoutes({
  initialRoute,
  user = createMockUser({ is_superuser: true }),
}: {
  initialRoute: string;
  user?: ReturnType<typeof createMockUser>;
}) {
  const { router } = renderRoutes(getRoutes, {
    initialRoute,
    storeInitialState: { currentUser: user },
  });
  return { router };
}

describe("application routes", () => {
  afterEach(() => {
    mockRenderMonitorOutlet = false;
    reinitialize();
  });

  describe("legacy Admin Tools redirects", () => {
    it.each([
      ["/admin/tools/tasks", "/monitor/tasks"],
      ["/admin/tools/tasks/list", "/monitor/tasks/list"],
      ["/admin/tools/tasks/list/42", "/monitor/tasks/list/42"],
      ["/admin/tools/tasks/runs", "/monitor/tasks/runs"],
      ["/admin/tools/tasks/runs/7", "/monitor/tasks/runs/7"],
      ["/admin/tools/jobs", "/monitor/jobs"],
      ["/admin/tools/jobs/sync", "/monitor/jobs/sync"],
      ["/admin/tools/logs", "/monitor/logs"],
      ["/admin/tools/logs/levels", "/monitor/logs/levels"],
      ["/admin/tools/errors", "/monitor/errors"],
      ["/admin/tools/model-caching", "/monitor/model-persistence-log"],
      ["/admin/tools/model-caching/9", "/monitor/model-persistence-log/9"],
      ["/admin/tools/notifications", "/monitor/notifications"],
      ["/admin/tools/notifications/13", "/monitor/notifications/13"],
    ])("redirects %s to %s", async (initialRoute, expectedPathname) => {
      const { router } = setupAppRoutes({ initialRoute });

      await waitFor(() => {
        expect(router?.location.pathname).toBe(expectedPathname);
      });
    });

    it("redirects the legacy Admin Tools index to the Monitor index", async () => {
      const { router } = setupAppRoutes({ initialRoute: "/admin/tools" });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/monitor");
      });
    });
  });

  describe("legacy AI Auditing redirects", () => {
    it.each([
      ["/admin/metabot/usage-auditing", "/monitor/ai-auditing/usage"],
      [
        "/admin/metabot/usage-auditing/conversations",
        "/monitor/ai-auditing/conversations",
      ],
      [
        "/admin/metabot/usage-auditing/conversations/42",
        "/monitor/ai-auditing/conversations/42",
      ],
      ["/admin/metabot/usage-auditing/mcp", "/monitor/ai-auditing/mcp"],
      ["/admin/metabot/usage-auditing/cli", "/monitor/ai-auditing/cli"],
    ])("redirects %s to %s", async (initialRoute, expectedPathname) => {
      const { router } = setupAppRoutes({ initialRoute });

      await waitFor(() => {
        expect(router?.location.pathname).toBe(expectedPathname);
      });
    });

    it("applies the AI Auditing guard after redirecting", async () => {
      mockRenderMonitorOutlet = true;
      PLUGIN_AUDIT.isAiAuditingEnabled = true;
      PLUGIN_AUDIT.getAiAuditingRoutes = () => (
        <Route path="usage" element={<div>AI Auditing</div>} />
      );

      const { router } = setupAppRoutes({
        initialRoute: "/admin/metabot/usage-auditing",
        user: createMockUser({ is_data_analyst: true }),
      });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/unauthorized");
      });
    });
  });
});

describe("disconnecting Slack with application routes", () => {
  afterEach(reinitialize);

  it.each([200, 401])(
    "should confirm Disconnect after leaving the page when the refresh returns %s",
    async (currentUserStatus) => {
      const user = createMockUser({
        sso_source: "slack",
        slack_account_status: "active",
      });
      const expectedPathname =
        currentUserStatus === 401 ? "/auth/login" : "/account/profile";
      const expectedUser =
        currentUserStatus === 401
          ? null
          : { ...user, slack_account_status: null };
      const response = defer<{ status: number }>();
      fetchMock.delete(
        `path:/api/user/${user.id}/slack`,
        () => response.promise,
      );
      const { router, store, disconnect } = setupAccountPassword({
        user,
        currentUserStatus,
        routes: getRoutes,
      });

      await disconnect();
      await userEvent.click(
        await screen.findByRole("tab", { name: "Profile" }),
      );
      await waitFor(() =>
        expect(router?.location.pathname).toBe("/account/profile"),
      );

      await act(async () => response.resolve({ status: 204 }));

      expect(
        await screen.findByText("Your Slack account has been disconnected."),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(router?.location.pathname).toBe(expectedPathname),
      );
      expect(getUser(store.getState())).toEqual(expectedUser);
    },
  );

  it("should stay on the chosen page when the refresh finishes after leaving Authentication", async () => {
    const user = createMockUser({
      sso_source: "google",
      slack_account_status: "active",
    });
    const response = defer<User>();
    fetchMock.get("path:/api/user/current", () => response.promise, {
      name: "current-user-refresh",
    });
    fetchMock.get("path:/api/pulse", []);
    fetchMock.get("path:/api/notification", []);
    const { router, disconnect } = setupAccountPassword({
      user,
      hasAuthPlugin: true,
      tokenFeatures: { disable_password_login: true },
      routes: getRoutes,
    });

    await disconnect();
    await waitFor(() =>
      expect(fetchMock.callHistory.called("current-user-refresh")).toBe(true),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "Notifications" }),
    );
    await waitFor(() =>
      expect(router?.location.pathname).toBe("/account/notifications"),
    );

    await act(async () =>
      response.resolve({ ...user, slack_account_status: null }),
    );

    expect(
      await screen.findByText("Your Slack account has been disconnected."),
    ).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/account/notifications");
  });

  it("should clear the cached user and render sign in when the Slack session ends", async () => {
    const { router, store, disconnect } = setupAccountPassword({
      user: createMockUser({
        sso_source: "slack",
        slack_account_status: "active",
      }),
      currentUserStatus: 401,
      routes: getRoutes,
    });
    const visited: string[] = [];
    router?.onLocationChange((location) => visited.push(location.pathname));

    await disconnect();

    expect(await screen.findByText(/Sign in to/)).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/auth/login");
    expect(getUser(store.getState())).toBeNull();
    expect(visited).not.toContain("/");
    expect(screen.queryByText("Slack")).not.toBeInTheDocument();
  });

  it("should replace the empty Authentication page in browser history", async () => {
    const { router, disconnect } = setupAccountPassword({
      user: createMockUser({
        sso_source: "google",
        slack_account_status: "active",
      }),
      hasAuthPlugin: true,
      tokenFeatures: { disable_password_login: true },
      routes: getRoutes,
    });

    await disconnect();
    await waitFor(() =>
      expect(router?.location.pathname).toBe("/account/profile"),
    );
    expect(await screen.findByTestId("user-locale-select")).toBeInTheDocument();

    act(() => router?.back());

    expect(router?.location.pathname).toBe("/account/profile");
    expect(screen.getByTestId("user-locale-select")).toBeInTheDocument();
  });
});

describe("collection modal routes", () => {
  it("renders the move-questions-into-dashboards modal with a single dialog", async () => {
    setupUserKeyValueEndpoints({
      namespace: "user_acknowledgement",
      key: "dashboard_question_migration_info_modal",
      value: false,
    });
    setupDashboardQuestionCandidatesEndpoint([]);

    setupAppRoutes({ initialRoute: "/collection/1/move-questions-dashboard" });

    expect(
      await screen.findByText("Move questions into their dashboards?"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

/**
 * The route tree must not depend on configuration: every route mounts on every
 * instance, and what a route renders is decided when it is navigated to. The
 * preload manifest, the router and the tests can then all treat one tree as
 * the truth.
 *
 * Two ratchets hold the invariant. Both lists may only shrink; when they are
 * empty, violations become hard failures.
 */

/** Configuration reads while the tree is being built. Shrink to []. */
const CONFIG_READS_DURING_BUILD: string[] = ["store.getState()"];

/** Routes that exist only under some token features. Shrink to {[], []}. */
const ROUTES_MOUNTED_CONDITIONALLY = {
  onlyWithFeatures: [
    "/admin/databases/:databaseId/destination-databases",
    "/admin/databases/:databaseId/destination-databases/:destinationDatabaseId",
    "/admin/databases/:databaseId/destination-databases/:destinationDatabaseId/remove",
    "/admin/databases/:databaseId/destination-databases/create",
    "/admin/databases/:databaseId/write-data",
    "/admin/metabot/system-prompts/natural-language-queries",
    "/admin/metabot/system-prompts/sql-generation",
    "/admin/metabot/usage-controls/ai-usage-limits",
    "/admin/metabot/usage-controls/mcp-tools-access",
    "/admin/people/:userId/unsubscribe",
    "/admin/people/tenants/:tenantId",
    "/admin/people/tenants/:tenantId/deactivate",
    "/admin/people/tenants/:tenantId/edit",
    "/admin/people/tenants/:tenantId/reactivate",
    "/admin/people/tenants/groups/:groupId",
    "/admin/people/tenants/new",
    "/admin/people/tenants/people/:userId",
    "/admin/people/tenants/people/:userId/deactivate",
    "/admin/people/tenants/people/:userId/edit",
    "/admin/people/tenants/people/:userId/reactivate",
    "/admin/people/tenants/people/:userId/reset",
    "/admin/people/tenants/people/:userId/success",
    "/admin/people/tenants/people/:userId/unsubscribe",
    "/admin/people/tenants/people/new",
    "/admin/people/tenants/user-strategy",
    "/admin/people/user-strategy",
    "/admin/permissions/application",
    "/admin/permissions/data/database/:databaseId/impersonated/group/:groupId",
    "/admin/permissions/data/database/:databaseId/schema/:schemaName/impersonated/group/:groupId",
    "/admin/permissions/data/database/:databaseId/schema/:schemaName/segmented/group/:groupId",
    "/admin/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId/impersonated/group/:groupId",
    "/admin/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId/segmented/group/:groupId",
    "/admin/permissions/data/database/:databaseId/segmented/group/:groupId",
    "/admin/permissions/data/database/:databaseId/table/:tableId/impersonated/group/:groupId",
    "/admin/permissions/data/database/:databaseId/table/:tableId/segmented/group/:groupId",
    "/admin/permissions/data/database/impersonated/group/:groupId",
    "/admin/permissions/data/database/segmented/group/:groupId",
    "/admin/permissions/data/group/:groupId/:tableId/segmented",
    "/admin/permissions/data/group/:groupId/database/:databaseId/:tableId/segmented",
    "/admin/permissions/data/group/:groupId/database/:databaseId/impersonated/database/:impersonatedDatabaseId",
    "/admin/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName/:tableId/segmented",
    "/admin/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName/impersonated/database/:impersonatedDatabaseId",
    "/admin/permissions/data/group/:groupId/impersonated/database/:impersonatedDatabaseId",
    "/admin/permissions/data/group/:tableId/segmented",
    "/admin/permissions/data/group/impersonated/database/:impersonatedDatabaseId",
    "/admin/permissions/tenant-collections",
    "/admin/permissions/tenant-collections/:collectionId",
    "/admin/permissions/tenant-specific-collections",
    "/admin/permissions/tenant-specific-collections/:collectionId",
    "/admin/security-center",
    "/apps/:name",
    "/apps/:name/*",
    "/browse/databases/:dbId/tables/:tableId/edit/:objectId?",
    "/collection/:slug/cleanup",
    "/data-studio/data/database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/dependencies",
    "/data-studio/data/database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/dependencies",
    "/data-studio/library/metrics",
    "/data-studio/library/metrics/:cardId",
    "/data-studio/library/metrics/:cardId/dependencies",
    "/data-studio/library/metrics/:cardId/dimensions",
    "/data-studio/library/metrics/:cardId/history",
    "/data-studio/library/metrics/:cardId/overview",
    "/data-studio/library/metrics/:cardId/query",
    "/data-studio/library/metrics/new",
    "/data-studio/library/tables",
    "/data-studio/library/tables/:tableId",
    "/data-studio/library/tables/:tableId/dependencies",
    "/data-studio/library/tables/:tableId/fields",
    "/data-studio/library/tables/:tableId/fields/:fieldId",
    "/data-studio/library/tables/:tableId/measures",
    "/data-studio/library/tables/:tableId/measures/:measureId",
    "/data-studio/library/tables/:tableId/measures/:measureId/dependencies",
    "/data-studio/library/tables/:tableId/measures/:measureId/revisions",
    "/data-studio/library/tables/:tableId/measures/new",
    "/data-studio/library/tables/:tableId/segments",
    "/data-studio/library/tables/:tableId/segments/:segmentId",
    "/data-studio/library/tables/:tableId/segments/:segmentId/dependencies",
    "/data-studio/library/tables/:tableId/segments/:segmentId/revisions",
    "/data-studio/library/tables/:tableId/segments/new",
    "/data-studio/snippets/:snippetId/dependencies",
    "/data-studio/transforms/:transformId/dependencies",
    "/data-studio/transforms/tools",
    "/data-studio/transforms/tools/migrate-models",
    "/embedding/permissions/application",
    "/embedding/permissions/data/database/:databaseId/impersonated/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/schema/:schemaName/impersonated/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/schema/:schemaName/segmented/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId/impersonated/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/schema/:schemaName/table/:tableId/segmented/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/segmented/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/table/:tableId/impersonated/group/:groupId",
    "/embedding/permissions/data/database/:databaseId/table/:tableId/segmented/group/:groupId",
    "/embedding/permissions/data/database/impersonated/group/:groupId",
    "/embedding/permissions/data/database/segmented/group/:groupId",
    "/embedding/permissions/data/group/:groupId/:tableId/segmented",
    "/embedding/permissions/data/group/:groupId/database/:databaseId/:tableId/segmented",
    "/embedding/permissions/data/group/:groupId/database/:databaseId/impersonated/database/:impersonatedDatabaseId",
    "/embedding/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName/:tableId/segmented",
    "/embedding/permissions/data/group/:groupId/database/:databaseId/schema/:schemaName/impersonated/database/:impersonatedDatabaseId",
    "/embedding/permissions/data/group/:groupId/impersonated/database/:impersonatedDatabaseId",
    "/embedding/permissions/data/group/:tableId/segmented",
    "/embedding/permissions/data/group/impersonated/database/:impersonatedDatabaseId",
    "/embedding/permissions/tenant-collections",
    "/embedding/permissions/tenant-collections/:collectionId",
    "/embedding/permissions/tenant-specific-collections",
    "/embedding/permissions/tenant-specific-collections/:collectionId",
    "/embedding/tenancy/:tenantId",
    "/embedding/tenancy/:tenantId/deactivate",
    "/embedding/tenancy/:tenantId/edit",
    "/embedding/tenancy/:tenantId/reactivate",
    "/embedding/tenancy/groups",
    "/embedding/tenancy/groups/:groupId",
    "/embedding/tenancy/new",
    "/embedding/tenancy/people",
    "/embedding/tenancy/people/:userId",
    "/embedding/tenancy/people/:userId/deactivate",
    "/embedding/tenancy/people/:userId/edit",
    "/embedding/tenancy/people/:userId/reactivate",
    "/embedding/tenancy/people/:userId/reset",
    "/embedding/tenancy/people/:userId/success",
    "/embedding/tenancy/people/:userId/unsubscribe",
    "/embedding/tenancy/people/new",
    "/embedding/tenancy/user-strategy",
    "/metric/:cardId/dependencies",
    "/monitor/ai-auditing",
    "/monitor/ai-auditing/cli",
    "/monitor/ai-auditing/cli/calls",
    "/monitor/ai-auditing/cli/usage",
    "/monitor/ai-auditing/conversations",
    "/monitor/ai-auditing/conversations/:convoId",
    "/monitor/ai-auditing/mcp",
    "/monitor/ai-auditing/mcp/events",
    "/monitor/ai-auditing/mcp/usage",
    "/monitor/ai-auditing/usage",
    "/monitor/ai-auditing/usage/:metric",
    "/monitor/api-key-usage/events",
    "/monitor/api-key-usage/usage",
    "/monitor/content-diagnostics/crowded",
    "/monitor/content-diagnostics/duplicated",
    "/monitor/content-diagnostics/empty",
    "/monitor/content-diagnostics/slow",
    "/monitor/content-diagnostics/sparse",
    "/monitor/content-diagnostics/stale",
    "/monitor/dependency-diagnostics/broken",
    "/monitor/dependency-diagnostics/unreferenced",
    "/monitor/sessions/:sessionId",
  ],
  onlyWithoutFeatures: [
    "/monitor/api-key-usage/*",
    "/monitor/content-diagnostics/*",
    "/monitor/dependency-diagnostics/*",
    "/monitor/sessions/*",
  ],
};

const featuresWith = (enabled: boolean): TokenFeatures => {
  const pairs = Object.keys(createMockTokenFeatures()).map((feature) => [
    feature,
    enabled,
  ]);

  // `fromEntries` widens the keys back to `string`, and every key here comes
  // from the shape of the mock itself.
  return Object.fromEntries(pairs) as TokenFeatures;
};

const storeFor = (tokenFeatures: TokenFeatures) => {
  const store = getStore(mainReducers, {
    settings: createMockSettingsState({ "token-features": tokenFeatures }),
  });

  // The test store satisfies `getRoutes` at runtime but not on paper.
  return store as unknown as Parameters<typeof getRoutes>[0];
};

const treeFor = (tokenFeatures: TokenFeatures) => {
  // Plugins write their slots once, at init, reading MetabaseSettings, so the
  // features have to be in place before they re-register.
  MetabaseSettings.set("token-features", tokenFeatures);
  reinitialize();
  setupEnterprisePlugins();

  return getRoutes(storeFor(tokenFeatures));
};

const patternsOf = (
  routes: RouteObject[],
  prefix = "",
  found = new Set<string>(),
) => {
  for (const route of routes) {
    const path = route.path ?? "";
    const here = path.startsWith("/")
      ? path
      : `${prefix}/${path}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    found.add(here);
    patternsOf(route.children ?? [], here === "/" ? "" : here, found);
  }
  return found;
};

describe("the route tree is the same on every instance", () => {
  it("reads no configuration while it is built", () => {
    const tokenFeatures = featuresWith(false);
    MetabaseSettings.set("token-features", tokenFeatures);
    reinitialize();
    setupEnterprisePlugins();

    const store = storeFor(tokenFeatures);
    const reads: string[] = [];

    const settingsSpy = jest
      .spyOn(MetabaseSettings, "get")
      .mockImplementation((key) => {
        reads.push(`MetabaseSettings.get("${String(key)}")`);
        return undefined;
      });
    const stateSpy = jest.spyOn(store, "getState");

    try {
      getRoutes(store);
    } finally {
      settingsSpy.mockRestore();
    }
    if (stateSpy.mock.calls.length > 0) {
      reads.push("store.getState()");
    }
    stateSpy.mockRestore();

    expect([...new Set(reads)].sort()).toEqual(CONFIG_READS_DURING_BUILD);
  });

  it("mounts the same routes with and without token features", () => {
    const withoutFeatures = patternsOf(treeFor(featuresWith(false)));
    const withFeatures = patternsOf(treeFor(featuresWith(true)));

    const received = {
      onlyWithFeatures: [...withFeatures]
        .filter((route) => !withoutFeatures.has(route))
        .sort(),
      onlyWithoutFeatures: [...withoutFeatures]
        .filter((route) => !withFeatures.has(route))
        .sort(),
    };
    expect(received).toEqual(ROUTES_MOUNTED_CONDITIONALLY);
  });
});
