import { act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type * as ReactModule from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupActionByEntityIdEndpoint,
  setupCardByEntityIdEndpoints,
  setupCollectionByEntityIdEndpoint,
  setupCurrentUserEndpoint,
  setupDashboardByEntityIdEndpoint,
  setupDashboardQuestionCandidatesEndpoint,
  setupDocumentByEntityIdEndpoint,
  setupDocumentEndpoints,
  setupDocumentErrorEndpoint,
  setupGetTransformByEntityIdEndpoint,
  setupGetTransformTestByEntityIdEndpoint,
  setupMeasureByEntityIdEndpoint,
  setupNativeQuerySnippetByEntityIdEndpoint,
  setupSegmentByEntityIdEndpoint,
  setupTableQueryMetadataEndpoint,
  setupTableQueryMetadataEndpointError,
  setupTimelineByEntityIdEndpoint,
  setupTimelineEndpoint,
  setupTimelineEventByEntityIdEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderRoutes, renderWithProviders, screen } from "__support__/ui";
import { setup as setupAccountPassword } from "metabase/account/password/containers/UserPasswordApp/tests/setup";
import {
  actionApi,
  cardApi,
  collectionApi,
  dashboardApi,
  measureApi,
  segmentApi,
  snippetApi,
  timelineApi,
  timelineEventApi,
  transformApi,
  useGetDocumentQuery,
} from "metabase/api";
import { getUser } from "metabase/current-user";
import type * as DashboardSelectors from "metabase/dashboard/selectors";
import { PLUGIN_AUDIT, reinitialize } from "metabase/plugins";
import type * as Redux from "metabase/redux";
import { Route, useParams } from "metabase/router";
import { defer } from "metabase/utils/promise";
import type { Document, User } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockDocument,
  createMockMeasure,
  createMockNativeQuerySnippet,
  createMockQueryAction,
  createMockSegment,
  createMockTable,
  createMockTimeline,
  createMockTimelineEvent,
  createMockTokenFeatures,
  createMockTransform,
  createMockTransformTest,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { LegacyBrowseRedirect, getRoutes } from "./routes";
import { getEntityIdRoutes } from "./routes-stable-id-aware";

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

jest.mock("metabase/dashboard/containers/DashboardApp/DashboardApp", () => {
  const { useState } = jest.requireActual<typeof ReactModule>("react");
  const { useSelector } = jest.requireActual<typeof Redux>("metabase/redux");
  const { getPrefetchedDashboard } = jest.requireActual<
    typeof DashboardSelectors
  >("metabase/dashboard/selectors");

  return {
    /** Names the dashboard that was handed over when the page first rendered, which is the one the real page loads. */
    DashboardApp: () => {
      const prefetchedDashboard = useSelector(getPrefetchedDashboard);
      const [handedOverDashboard] = useState(prefetchedDashboard);

      return (
        <>
          <div>dashboard app</div>
          {handedOverDashboard && (
            <div>handed over: {handedOverDashboard.name}</div>
          )}
        </>
      );
    },
  };
});

function setupAppRoutes({
  initialRoute,
  user = createMockUser({ is_superuser: true }),
}: {
  initialRoute: string;
  user?: ReturnType<typeof createMockUser>;
}) {
  const { router, store } = renderRoutes(getRoutes, {
    initialRoute,
    storeInitialState: { currentUser: user },
  });
  return { router, store };
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

describe("dashboard entity-id deep links", () => {
  const DASHBOARD_EID = createMockEntityId("xBLdW9FsgRuB2HGhWiBa_");
  const TAB_EID = createMockEntityId("N-o1tJ9swdO4YJycqMA8P");
  const DASHCARD_EID = createMockEntityId("19JbScZRjz5mSQ7chtjuY");
  const UNKNOWN_DASHCARD_EID = "unknownDashcardEid___";
  const DASHBOARD_ID = 1;
  const TAB_ID = 2;
  const DASHCARD_ID = 25;
  const DASHBOARD = createMockDashboard({
    id: DASHBOARD_ID,
    name: "E-commerce insights",
    entity_id: DASHBOARD_EID,
    tabs: [
      createMockDashboardTab({
        id: TAB_ID,
        dashboard_id: DASHBOARD_ID,
        name: "Revenue",
        entity_id: TAB_EID,
      }),
    ],
    dashcards: [
      createMockDashboardCard({
        id: DASHCARD_ID,
        dashboard_id: DASHBOARD_ID,
        dashboard_tab_id: TAB_ID,
        entity_id: DASHCARD_EID,
      }),
    ],
  });

  type SetupOpts = {
    initialRoute: string;
  };

  function setup({ initialRoute }: SetupOpts) {
    setupDashboardByEntityIdEndpoint(DASHBOARD);

    const { router, store } = setupAppRoutes({ initialRoute });
    return { router, store };
  }

  it("opens the dashboard by the entity_id in the path", async () => {
    const { router } = setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(`/dashboard/${DASHBOARD_ID}`),
    );
    expect(await screen.findByText("dashboard app")).toBeInTheDocument();
  });

  it("loads the dashboard itself and does not ask for a translation of its entity_id", async () => {
    const { router } = setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}?tab=${TAB_EID}#scrollTo=${DASHCARD_EID}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(`/dashboard/${DASHBOARD_ID}`),
    );
    expect(
      fetchMock.callHistory.calls(`path:/api/dashboard/${DASHBOARD_EID}`),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls("path:/api/eid-translation/translate"),
    ).toHaveLength(0);
  });

  it("hands the loaded dashboard over to the dashboard page", async () => {
    setup({ initialRoute: `/dashboard/entity/${DASHBOARD_EID}` });

    expect(
      await screen.findByText(`handed over: ${DASHBOARD.name}`),
    ).toBeInTheDocument();
  });

  it("forgets the loaded dashboard when the address it redirects to has no dashboard page", async () => {
    const { router, store } = setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}/no-such-page`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        `/dashboard/${DASHBOARD_ID}/no-such-page`,
      ),
    );
    await waitFor(() =>
      expect(store.getState().dashboard.prefetchedDashboard).toBeNull(),
    );
  });

  it("caches the dashboard under its numeric ID", async () => {
    const { router, store } = setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(`/dashboard/${DASHBOARD_ID}`),
    );
    const cached = dashboardApi.endpoints.getDashboard.select({
      id: DASHBOARD_ID,
    })(store.getState());
    expect(cached.data).toEqual(DASHBOARD);
  });

  it("keeps the sub-path and the other query parameters", async () => {
    const { router } = setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}/move?category=Gizmo&tab=${TAB_EID}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(`/dashboard/${DASHBOARD_ID}/move`),
    );
    expect(router?.location.search).toBe(`?category=Gizmo&tab=${TAB_ID}`);
  });

  it("swaps the tab and the scrollTo dashcard entity_ids for their numeric ids", async () => {
    const { router } = setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}?tab=${TAB_EID}#scrollTo=${DASHCARD_EID}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(`/dashboard/${DASHBOARD_ID}`),
    );
    expect(router?.location.search).toBe(`?tab=${TAB_ID}`);
    expect(router?.location.hash).toBe(`#scrollTo=${DASHCARD_ID}`);
  });

  it("drops a scrollTo entity_id that doesn't exist and keeps the rest of the hash", async () => {
    const { router } = setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}#scrollTo=${UNKNOWN_DASHCARD_EID}&fullscreen`,
    });

    expect(await screen.findByText("dashboard app")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(`/dashboard/${DASHBOARD_ID}`);
    expect(router?.location.hash).toBe("#fullscreen");
  });

  it("keeps a hash without entity_ids as it is", async () => {
    const { router } = setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}#scrollTo=${DASHCARD_ID}&refresh=60`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(`/dashboard/${DASHBOARD_ID}`),
    );
    expect(router?.location.hash).toBe(`#scrollTo=${DASHCARD_ID}&refresh=60`);
  });

  it("shows a 404 for a tab entity_id that doesn't exist, even when it starts with a number", async () => {
    setup({
      initialRoute: `/dashboard/entity/${DASHBOARD_EID}?tab=${"12".padEnd(21, "x")}`,
    });

    expect(
      await screen.findByText("We're a little lost..."),
    ).toBeInTheDocument();
  });
});

const DOCUMENT_ENTITY_ID = createMockEntityId("Q33LGfG6-NfCnhhzXXbeW");
const DOCUMENT = createMockDocument({
  id: 7,
  name: "Quarterly planning notes",
});
const DOCUMENT_ENTITY_ID_ROUTE = `/document/entity/${DOCUMENT_ENTITY_ID}`;

describe("entity ID routes", () => {
  afterEach(reinitialize);

  const SNIPPET = createMockNativeQuerySnippet({
    id: 7,
    name: "Active customers filter",
    entity_id: createMockEntityId("SxK3Lg37DTANoAntMdKwi"),
  });

  type SetupOpts = {
    initialRoute: string;
  };

  /** Loads the document by the numeric ID in the URL, as the document page does. */
  function DocumentTitle() {
    const { id } = useParams();
    const { data: document } = useGetDocumentQuery({ id: Number(id) });

    return <div>{document?.name}</div>;
  }

  /** Renders only the app's entity ID routes, with stand-ins for the pages they redirect to. */
  function setup({ initialRoute }: SetupOpts) {
    const { router, store } = renderRoutes(
      () => [
        ...getEntityIdRoutes(),
        { path: "start", element: <div>start page</div> },
        { path: "document/:id/*", element: <DocumentTitle /> },
        { path: "*", element: <div>destination</div> },
      ],
      { initialRoute },
    );

    return { router, store };
  }

  describe("the redirect, seen on the document route", () => {
    beforeEach(() => {
      setupDocumentEndpoints(DOCUMENT);
    });

    it("loads the entity by its entity ID and redirects to its URL", async () => {
      setupDocumentByEntityIdEndpoint(DOCUMENT_ENTITY_ID, DOCUMENT);
      const { router } = setup({ initialRoute: DOCUMENT_ENTITY_ID_ROUTE });

      await waitFor(() =>
        expect(router?.location.pathname).toBe(`/document/${DOCUMENT.id}`),
      );
      expect(await screen.findByText(DOCUMENT.name)).toBeInTheDocument();
    });

    it("keeps the sub-path, the query string and the hash", async () => {
      setupDocumentByEntityIdEndpoint(DOCUMENT_ENTITY_ID, DOCUMENT);
      const { router } = setup({
        initialRoute: `${DOCUMENT_ENTITY_ID_ROUTE}/comments/all?logo=false#section-2`,
      });

      await waitFor(() =>
        expect(router?.location.pathname).toBe(
          `/document/${DOCUMENT.id}/comments/all`,
        ),
      );
      expect(router?.location.search).toBe("?logo=false");
      expect(router?.location.hash).toBe("#section-2");
    });

    it.each(["what%3F", "a%2Fb", "..%2F..%2Fauth%2Flogout"])(
      "keeps the encoded sub-path %s as it is",
      async (subPath) => {
        setupDocumentByEntityIdEndpoint(DOCUMENT_ENTITY_ID, DOCUMENT);
        const { router } = setup({
          initialRoute: `${DOCUMENT_ENTITY_ID_ROUTE}/${subPath}`,
        });

        await waitFor(() =>
          expect(router?.location.pathname).toBe(
            `/document/${DOCUMENT.id}/${subPath}`,
          ),
        );
      },
    );

    it("does not request the entity again from the page it redirects to", async () => {
      setupDocumentByEntityIdEndpoint(DOCUMENT_ENTITY_ID, DOCUMENT);
      setup({ initialRoute: DOCUMENT_ENTITY_ID_ROUTE });

      expect(await screen.findByText(DOCUMENT.name)).toBeInTheDocument();
      expect(
        fetchMock.callHistory.calls(`path:/api/document/${DOCUMENT_ENTITY_ID}`),
      ).toHaveLength(1);
      expect(
        fetchMock.callHistory.calls(`path:/api/document/${DOCUMENT.id}`),
      ).toHaveLength(0);
    });

    it("replaces the entity ID address in the browser history", async () => {
      setupDocumentByEntityIdEndpoint(DOCUMENT_ENTITY_ID, DOCUMENT);
      const { router } = setup({ initialRoute: "/start" });

      act(() => router?.navigate(DOCUMENT_ENTITY_ID_ROUTE));
      await waitFor(() =>
        expect(router?.location.pathname).toBe(`/document/${DOCUMENT.id}`),
      );
      act(() => router?.back());

      expect(router?.location.pathname).toBe("/start");
      expect(screen.getByText("start page")).toBeInTheDocument();
    });

    it("shows the not found page when the value is not an entity ID", async () => {
      setup({ initialRoute: `/document/entity/${DOCUMENT.id}` });

      expect(
        await screen.findByText("We're a little lost..."),
      ).toBeInTheDocument();
      expect(fetchMock.callHistory.calls()).toHaveLength(0);
    });

    it("reports a failed load to the app's error page", async () => {
      setupDocumentErrorEndpoint(DOCUMENT_ENTITY_ID, { status: 404 });
      const { router, store } = setup({
        initialRoute: DOCUMENT_ENTITY_ID_ROUTE,
      });

      await waitFor(() =>
        expect(store.getState().app.errorPage).toMatchObject({ status: 404 }),
      );
      expect(router?.location.pathname).toBe(DOCUMENT_ENTITY_ID_ROUTE);
    });

    it("does not report an earlier failure again while the same address loads anew", async () => {
      setupDocumentErrorEndpoint(DOCUMENT_ENTITY_ID, { status: 403 });
      const { router, store } = setup({
        initialRoute: DOCUMENT_ENTITY_ID_ROUTE,
      });
      await waitFor(() =>
        expect(store.getState().app.errorPage).toMatchObject({ status: 403 }),
      );
      const retry = defer<Document>();
      fetchMock.removeRoutes();
      setupDocumentByEntityIdEndpoint(DOCUMENT_ENTITY_ID, retry.promise);

      act(() => {
        router?.navigate("/start");
      });
      act(() => {
        router?.navigate(DOCUMENT_ENTITY_ID_ROUTE);
      });
      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls(
            `path:/api/document/${DOCUMENT_ENTITY_ID}`,
          ),
        ).toHaveLength(2),
      );

      expect(store.getState().app.errorPage).toBeNull();
      retry.resolve(DOCUMENT);
      await waitFor(() =>
        expect(router?.location.pathname).toBe(`/document/${DOCUMENT.id}`),
      );
    });
  });

  it("opens a snippet by its entity ID and caches it under its numeric ID", async () => {
    setupNativeQuerySnippetByEntityIdEndpoint(SNIPPET);
    const { router, store } = setup({
      initialRoute: `/snippet/entity/${SNIPPET.entity_id}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        `/data-studio/snippets/${SNIPPET.id}`,
      ),
    );
    const cached = snippetApi.endpoints.getSnippet.select(SNIPPET.id)(
      store.getState(),
    );
    expect(cached.data).toEqual(SNIPPET);
  });

  it("opens a transform by its entity ID and caches it under its numeric ID", async () => {
    const entityId = createMockEntityId("gNAIM3vXZLQrgoTtn8Ck4");
    const transform = createMockTransform({
      id: 7,
      name: "Revenue by category",
    });
    setupGetTransformByEntityIdEndpoint(entityId, transform);
    const { router, store } = setup({
      initialRoute: `/transform/entity/${entityId}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        `/data-studio/transforms/${transform.id}`,
      ),
    );
    const cached = transformApi.endpoints.getTransform.select(transform.id)(
      store.getState(),
    );
    expect(cached.data).toEqual(transform);
  });

  it("opens a transform test by its entity ID when transform testing is available", async () => {
    const test = createMockTransformTest({
      id: 7,
      transform_id: 3,
      name: "Refunded orders are excluded",
      entity_id: "QGD3Qgbdvx6d3ES4aqVRV",
    });
    setupGetTransformTestByEntityIdEndpoint(test);
    mockSettings({
      "token-features": createMockTokenFeatures({ "transforms-testing": true }),
    });
    setupEnterpriseOnlyPlugin("data-testing");
    const { router } = setup({
      initialRoute: `/transform-test/entity/${test.entity_id}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        "/data-studio/transforms/3/tests/7",
      ),
    );
  });

  it("has no transform test route when transform testing is not available", async () => {
    const initialRoute = "/transform-test/entity/QGD3Qgbdvx6d3ES4aqVRV";
    const { router } = setup({ initialRoute });

    expect(await screen.findByText("destination")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(initialRoute);
  });

  it("opens a timeline by its entity ID and caches it under its numeric ID", async () => {
    const entityId = createMockEntityId("qMW2CX_Ogce_OizqQjyYa");
    const timeline = createMockTimeline({
      id: 7,
      name: "Marketing campaigns",
      collection_id: 5,
      collection: createMockCollection({ id: 5, name: "Marketing" }),
    });
    setupTimelineByEntityIdEndpoint(entityId, timeline);
    const { router, store } = setup({
      initialRoute: `/timeline/entity/${entityId}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        "/collection/5-marketing/timelines/7",
      ),
    );
    const cached = timelineApi.endpoints.getTimeline.select({
      id: timeline.id,
      include: "events",
    })(store.getState());
    expect(cached.data).toEqual(timeline);
  });

  it("opens a timeline of the root collection by its entity ID", async () => {
    const entityId = createMockEntityId("L8mVGHQFudEKh0iVdnW42");
    const timeline = createMockTimeline({
      id: 7,
      name: "Product launches",
      collection_id: null,
      collection: createMockCollection({ id: "root", name: "Our analytics" }),
    });
    setupTimelineByEntityIdEndpoint(entityId, timeline);
    const { router } = setup({
      initialRoute: `/timeline/entity/${entityId}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe("/collection/root/timelines/7"),
    );
  });

  it("opens a timeline event by its entity ID and caches it under its numeric ID", async () => {
    const entityId = createMockEntityId("iqD6mVK_mGnL8t2b-Jgd_");
    const event = createMockTimelineEvent({
      id: 9,
      timeline_id: 7,
      name: "Black Friday sale",
    });
    const timeline = createMockTimeline({
      id: 7,
      name: "Marketing campaigns",
      collection_id: 5,
      collection: createMockCollection({ id: 5, name: "Marketing" }),
      events: [event],
    });
    setupTimelineEventByEntityIdEndpoint(entityId, event);
    setupTimelineEndpoint(timeline);
    const { router, store } = setup({
      initialRoute: `/timeline-event/entity/${entityId}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        "/collection/5-marketing/timelines/7/events/9/edit",
      ),
    );
    const cachedEvent = timelineEventApi.endpoints.getTimelineEvent.select(
      event.id,
    )(store.getState());
    expect(cachedEvent.data).toEqual(event);
    const cachedTimeline = timelineApi.endpoints.getTimeline.select({
      id: timeline.id,
      include: "events",
    })(store.getState());
    expect(cachedTimeline.data).toEqual(timeline);
  });

  it.each([
    {
      name: "a user who cannot change the timeline",
      canWrite: false,
      isArchived: false,
    },
    { name: "an archived event", canWrite: true, isArchived: true },
  ])(
    "opens the timeline instead of the edit form for $name",
    async ({ canWrite, isArchived }) => {
      const entityId = createMockEntityId("iqD6mVK_mGnL8t2b-Jgd_");
      const event = createMockTimelineEvent({
        id: 9,
        timeline_id: 7,
        name: "Black Friday sale",
        archived: isArchived,
      });
      const timeline = createMockTimeline({
        id: 7,
        name: "Marketing campaigns",
        collection_id: 5,
        collection: createMockCollection({
          id: 5,
          name: "Marketing",
          can_write: canWrite,
        }),
      });
      setupTimelineEventByEntityIdEndpoint(entityId, event);
      setupTimelineEndpoint(timeline);
      const { router } = setup({
        initialRoute: `/timeline-event/entity/${entityId}`,
      });

      await waitFor(() =>
        expect(router?.location.pathname).toBe(
          "/collection/5-marketing/timelines/7",
        ),
      );
    },
  );

  it("opens an action by its entity ID and caches it under its numeric ID", async () => {
    const action = createMockQueryAction({
      id: 7,
      name: "Reset order total",
      entity_id: createMockEntityId("DCHUxhG7_ZGpJFEnOSIQP"),
    });
    setupActionByEntityIdEndpoint(action);
    const { router, store } = setup({
      initialRoute: `/action/entity/${action.entity_id}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe("/data-studio/actions/7"),
    );
    const cached = actionApi.endpoints.getAction.select({ id: action.id })(
      store.getState(),
    );
    expect(cached.data).toEqual(action);
  });

  it("opens a segment by its entity ID and caches it under its numeric ID", async () => {
    const entityId = createMockEntityId("0FOcxxBpOwgzlF7888IJn");
    const table = createMockTable({ id: 9, db_id: 3, schema: "public" });
    const segment = createMockSegment({
      id: 7,
      name: "Large orders",
      table_id: table.id,
    });
    setupSegmentByEntityIdEndpoint(entityId, segment);
    setupTableQueryMetadataEndpoint(table);
    const { router, store } = setup({
      initialRoute: `/segment/entity/${entityId}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        "/data-studio/data/database/3/schema/3:public/table/9/segments/7",
      ),
    );
    const cached = segmentApi.endpoints.getSegment.select(segment.id)(
      store.getState(),
    );
    expect(cached.data).toEqual(segment);
  });

  it("reports a failed request for the table of a segment", async () => {
    const entityId = createMockEntityId("0FOcxxBpOwgzlF7888IJn");
    const segment = createMockSegment({
      id: 7,
      name: "Large orders",
      table_id: 9,
    });
    setupSegmentByEntityIdEndpoint(entityId, segment);
    setupTableQueryMetadataEndpointError(segment.table_id);
    const initialRoute = `/segment/entity/${entityId}`;
    const { router, store } = setup({ initialRoute });

    await waitFor(() =>
      expect(store.getState().app.errorPage).toMatchObject({ status: 500 }),
    );
    expect(router?.location.pathname).toBe(initialRoute);
  });

  describe("moving from one entity address to another", () => {
    const DASHBOARD = createMockDashboard({
      id: 1,
      name: "E-commerce insights",
      entity_id: createMockEntityId("xBLdW9FsgRuB2HGhWiBa_"),
    });
    const UNKNOWN_TAB_ENTITY_ID = "12".padEnd(21, "x");

    /** Opens a dashboard address that stays on the not found page, with its dashboard loaded. */
    async function setupOnNotFound() {
      setupDashboardByEntityIdEndpoint(DASHBOARD);
      const { router } = setup({
        initialRoute: `/dashboard/entity/${DASHBOARD.entity_id}?tab=${UNKNOWN_TAB_ENTITY_ID}`,
      });
      expect(
        await screen.findByText("We're a little lost..."),
      ).toBeInTheDocument();

      return { router };
    }

    it("redirects to the entity of the new address, not the one loaded before", async () => {
      const entityId = createMockEntityId("HyB3nRtqb7pBPhFG26evI");
      const collection = createMockCollection({ id: 5, name: "Marketing" });
      setupCollectionByEntityIdEndpoint(entityId, collection);
      const { router } = await setupOnNotFound();

      act(() => {
        router?.navigate(`/collection/entity/${entityId}`);
      });

      await waitFor(() =>
        expect(router?.location.pathname).toBe("/collection/5"),
      );
    });

    it("opens a route that needs a second request", async () => {
      const entityId = createMockEntityId("0FOcxxBpOwgzlF7888IJn");
      const table = createMockTable({ id: 9, db_id: 3, schema: "public" });
      const segment = createMockSegment({
        id: 7,
        name: "Large orders",
        table_id: table.id,
      });
      setupSegmentByEntityIdEndpoint(entityId, segment);
      setupTableQueryMetadataEndpoint(table);
      const { router } = await setupOnNotFound();

      act(() => {
        router?.navigate(`/segment/entity/${entityId}`);
      });

      await waitFor(() =>
        expect(router?.location.pathname).toBe(
          "/data-studio/data/database/3/schema/3:public/table/9/segments/7",
        ),
      );
    });
  });

  it("opens a measure by its entity ID and caches it under its numeric ID", async () => {
    const entityId = createMockEntityId("Tbhlw5PiFlq74KKxlpw5o");
    const table = createMockTable({ id: 9, db_id: 3, schema: "public" });
    const measure = createMockMeasure({
      id: 7,
      name: "Total revenue",
      table_id: table.id,
    });
    setupMeasureByEntityIdEndpoint(entityId, measure);
    setupTableQueryMetadataEndpoint(table);
    const { router, store } = setup({
      initialRoute: `/measure/entity/${entityId}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        "/data-studio/data/database/3/schema/3:public/table/9/measures/7",
      ),
    );
    const cached = measureApi.endpoints.getMeasure.select(measure.id)(
      store.getState(),
    );
    expect(cached.data).toEqual(measure);
  });

  it("opens a question by its entity ID and caches it under its numeric ID", async () => {
    const question = createMockCard({
      id: 7,
      name: "Aerodynamic Copper Knife trend",
      type: "question",
      entity_id: createMockEntityId("BQAQ6YNiUIMfmAPLpSKQW"),
    });
    setupCardByEntityIdEndpoints(question);
    const { router, store } = setup({
      initialRoute: `/question/entity/${question.entity_id}/notebook`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe("/question/7/notebook"),
    );
    const cached = cardApi.endpoints.getCard.select({ id: question.id })(
      store.getState(),
    );
    expect(cached.data).toEqual(question);
    expect(
      fetchMock.callHistory.calls("path:/api/eid-translation/translate"),
    ).toHaveLength(0);
  });

  it("opens a collection by its entity ID and caches it under its numeric ID", async () => {
    const entityId = createMockEntityId("HyB3nRtqb7pBPhFG26evI");
    const collection = createMockCollection({
      id: 5,
      name: "Marketing",
      entity_id: entityId,
    });
    setupCollectionByEntityIdEndpoint(entityId, collection);
    const { router, store } = setup({
      initialRoute: `/collection/entity/${entityId}/timelines`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe("/collection/5/timelines"),
    );
    const cached = collectionApi.endpoints.getCollection.select({
      id: collection.id,
    })(store.getState());
    expect(cached.data).toEqual(collection);
    expect(
      fetchMock.callHistory.calls("path:/api/eid-translation/translate"),
    ).toHaveLength(0);
  });

  it("opens a model by its entity ID and caches it under its numeric ID", async () => {
    const model = createMockCard({
      id: 7,
      name: "Orders + People",
      type: "model",
      entity_id: createMockEntityId("_GiVL6zYmsnBb1oqLCp4u"),
    });
    setupCardByEntityIdEndpoints(model);
    const { router, store } = setup({
      initialRoute: `/model/entity/${model.entity_id}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe("/model/7-orders-people"),
    );
    const cached = cardApi.endpoints.getCard.select({ id: model.id })(
      store.getState(),
    );
    expect(cached.data).toEqual(model);
  });

  it("opens a metric by its entity ID and caches it under its numeric ID", async () => {
    const metric = createMockCard({
      id: 7,
      name: "Number of Orders",
      type: "metric",
      entity_id: createMockEntityId("8EdazRgPwfxdiltp7NCjS"),
    });
    setupCardByEntityIdEndpoints(metric);
    const { router, store } = setup({
      initialRoute: `/metric/entity/${metric.entity_id}`,
    });

    await waitFor(() => expect(router?.location.pathname).toBe("/metric/7"));
    const cached = cardApi.endpoints.getCard.select({ id: metric.id })(
      store.getState(),
    );
    expect(cached.data).toEqual(metric);
  });

  it("opens a card on the page for its own type, whichever card route was used", async () => {
    const question = createMockCard({
      id: 7,
      name: "Aerodynamic Copper Knife trend",
      type: "question",
      entity_id: createMockEntityId("BQAQ6YNiUIMfmAPLpSKQW"),
    });
    setupCardByEntityIdEndpoints(question);
    const { router } = setup({
      initialRoute: `/model/entity/${question.entity_id}`,
    });

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        "/question/7-aerodynamic-copper-knife-trend",
      ),
    );
  });
});
