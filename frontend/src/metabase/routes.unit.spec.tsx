import { render, waitFor } from "@testing-library/react";

import { setupCurrentUserEndpoint } from "__support__/server-mocks";
import {
  getTestStoreAndWrapper,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { PLUGIN_AUDIT, reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { LegacyBrowseRedirect, getRoutes } from "./routes";

function setupLegacyBrowseRedirect(initialRoute: string) {
  setupCurrentUserEndpoint(createMockUser());

  const { history } = renderWithProviders(
    <Route path="browse">
      <Route path="databases/:slug" element={<div>browse databases</div>} />
      <Route path=":dbIdAndSlug" element={<LegacyBrowseRedirect />} />
    </Route>,
    { withRouter: true, initialRoute },
  );

  return history;
}

describe("LegacyBrowseRedirect", () => {
  it("redirects a v48-era /browse/<dbId>-<slug> url onto /browse/databases", async () => {
    const history = setupLegacyBrowseRedirect("/browse/5-orders");

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        "/browse/databases/5-orders",
      ),
    );
    expect(screen.getByText("browse databases")).toBeInTheDocument();
  });

  it("does not redirect a segment without the legacy hyphenated shape", async () => {
    const history = setupLegacyBrowseRedirect("/browse/orders");

    expect(history?.getCurrentLocation().pathname).toBe("/browse/orders");
  });
});

jest.mock("metabase/AppComponent", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    __esModule: true,
    default: () => <Outlet />,
  };
});

let mockRenderMonitorOutlet = false;

jest.mock("metabase/monitor/components/MonitorLayout", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    MonitorLayout: () => (mockRenderMonitorOutlet ? <Outlet /> : null),
  };
});

function setupAppRoutes({
  initialRoute,
  user = createMockUser({ is_superuser: true }),
}: {
  initialRoute: string;
  user?: ReturnType<typeof createMockUser>;
}) {
  const { wrapper, store, history } = getTestStoreAndWrapper({
    withRouter: true,
    initialRoute,
    storeInitialState: { currentUser: user },
  });
  render(getRoutes(store), { wrapper });
  return { history };
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
      ["/admin/tools/model-caching", "/monitor/model-caching"],
      ["/admin/tools/model-caching/9", "/monitor/model-caching/9"],
      ["/admin/tools/notifications", "/monitor/notifications"],
      ["/admin/tools/notifications/13", "/monitor/notifications/13"],
    ])("redirects %s to %s", async (initialRoute, expectedPathname) => {
      const { history } = setupAppRoutes({ initialRoute });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe(expectedPathname);
      });
    });

    it("redirects the legacy Admin Tools index to the Monitor index", async () => {
      const { history } = setupAppRoutes({ initialRoute: "/admin/tools" });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/monitor");
      });
    });
  });

  describe("legacy AI Auditing redirects", () => {
    it.each([
      ["/admin/metabot/usage-auditing", "/monitor/ai-auditing"],
      [
        "/admin/metabot/usage-auditing/conversations",
        "/monitor/ai-auditing/conversations",
      ],
      [
        "/admin/metabot/usage-auditing/conversations/42",
        "/monitor/ai-auditing/conversations/42",
      ],
      ["/admin/metabot/usage-auditing/mcp", "/monitor/ai-auditing/mcp"],
    ])("redirects %s to %s", async (initialRoute, expectedPathname) => {
      const { history } = setupAppRoutes({ initialRoute });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe(expectedPathname);
      });
    });

    it("applies the AI Auditing guard after redirecting", async () => {
      mockRenderMonitorOutlet = true;
      PLUGIN_AUDIT.isAiAuditingEnabled = true;
      PLUGIN_AUDIT.getAiAuditingRoutes = () => (
        <Route index element={<div>AI Auditing</div>} />
      );

      const { history } = setupAppRoutes({
        initialRoute: "/admin/metabot/usage-auditing",
        user: createMockUser({ is_data_analyst: true }),
      });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/unauthorized");
      });
    });
  });
});
