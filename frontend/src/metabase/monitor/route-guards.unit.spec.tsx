import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { parseSearchQuery } from "metabase/utils/browser";
import { createMockUser } from "metabase-types/api/mocks";

import {
  CanAccessAiAuditing,
  CanAccessAlertsManagement,
  CanAccessContentDiagnostics,
  CanAccessDependencyDiagnostics,
  CanAccessMonitor,
} from "./route-guards";

describe("monitor route-guards", () => {
  describe("CanAccessMonitor", () => {
    interface SetupOpts {
      currentUser?: ReturnType<typeof createMockUser>;
    }

    const setup = ({ currentUser }: SetupOpts = {}) => {
      return renderWithProviders(
        <>
          <Route element={<CanAccessMonitor />}>
            <Route path="/monitor" element={<div>monitor page</div>} />
          </Route>
          <Route path="/auth/login" element={<div>login page</div>} />
          <Route path="/unauthorized" element={<div>unauthorized</div>} />
        </>,
        {
          storeInitialState: createMockState({
            currentUser,
            settings: createMockSettingsState({ "has-user-setup": true }),
          }),
          withRouter: true,
          initialRoute: "/monitor",
        },
      );
    };

    it("redirects unauthenticated users to login with redirect back", async () => {
      const { router } = setup({ currentUser: undefined });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/auth/login");
      });

      expect(new URLSearchParams(router?.location.search).get("redirect")).toBe(
        "/monitor",
      );
    });

    it("redirects users without monitor access to unauthorized", async () => {
      const { router } = setup({
        currentUser: createMockUser({
          is_data_analyst: false,
          is_superuser: false,
        }),
      });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/unauthorized");
      });

      expect(router?.location.search).toBe("");
    });

    it("renders for analysts", () => {
      setup({
        currentUser: createMockUser({
          is_data_analyst: true,
          is_superuser: false,
        }),
      });

      expect(screen.getByText("monitor page")).toBeInTheDocument();
    });
  });

  describe("the diagnostics guards", () => {
    const DEPENDENCY_ROUTE = "/monitor/dependency-diagnostics";
    const CONTENT_ROUTE = "/monitor/content-diagnostics";

    const DEPENDENCY_PAGE = "dependency diagnostics page";
    const CONTENT_PAGE = "content diagnostics page";

    const BOTH_SECTIONS = [
      [DEPENDENCY_ROUTE, DEPENDENCY_PAGE],
      [CONTENT_ROUTE, CONTENT_PAGE],
    ];

    interface SetupOpts {
      currentUser?: ReturnType<typeof createMockUser>;
      initialRoute: string;
    }

    const setup = ({ currentUser, initialRoute }: SetupOpts) => {
      return renderWithProviders(
        <>
          <Route element={<CanAccessDependencyDiagnostics />}>
            <Route
              path={DEPENDENCY_ROUTE}
              element={<div>{DEPENDENCY_PAGE}</div>}
            />
          </Route>
          <Route element={<CanAccessContentDiagnostics />}>
            <Route path={CONTENT_ROUTE} element={<div>{CONTENT_PAGE}</div>} />
          </Route>
          <Route path="/unauthorized" element={<div>unauthorized</div>} />
        </>,
        {
          storeInitialState: createMockState({
            currentUser,
            settings: createMockSettingsState({ "has-user-setup": true }),
          }),
          withRouter: true,
          initialRoute,
        },
      );
    };

    const monitoringOnlyUser = () =>
      createMockUser({
        is_superuser: false,
        is_data_analyst: false,
        permissions: { can_access_monitoring: true },
      });

    it.each(BOTH_SECTIONS)(
      "renders %s for an analyst",
      async (initialRoute, pageText) => {
        setup({
          currentUser: createMockUser({
            is_superuser: false,
            is_data_analyst: true,
          }),
          initialRoute,
        });

        expect(await screen.findByText(pageText)).toBeInTheDocument();
      },
    );

    it("renders content diagnostics for a monitoring-only user", async () => {
      setup({
        currentUser: monitoringOnlyUser(),
        initialRoute: CONTENT_ROUTE,
      });

      expect(await screen.findByText(CONTENT_PAGE)).toBeInTheDocument();
    });

    it("redirects a monitoring-only user away from dependency diagnostics", async () => {
      const { router } = setup({
        currentUser: monitoringOnlyUser(),
        initialRoute: DEPENDENCY_ROUTE,
      });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/unauthorized");
      });

      expect(router?.location.search).toBe("");
      expect(screen.queryByText(DEPENDENCY_PAGE)).not.toBeInTheDocument();
    });

    it.each(BOTH_SECTIONS)(
      "redirects a user with none of the three away from %s",
      async (initialRoute, pageText) => {
        const { router } = setup({
          currentUser: createMockUser({
            is_superuser: false,
            is_data_analyst: false,
            permissions: { can_access_monitoring: false },
          }),
          initialRoute,
        });

        await waitFor(() => {
          expect(router?.location.pathname).toBe("/unauthorized");
        });

        expect(screen.queryByText(pageText)).not.toBeInTheDocument();
      },
    );
  });

  describe("CanAccessAlertsManagement", () => {
    interface SetupOpts {
      currentUser?: ReturnType<typeof createMockUser>;
    }

    const setup = ({ currentUser }: SetupOpts = {}) => {
      return renderWithProviders(
        <>
          <Route element={<CanAccessAlertsManagement />}>
            <Route
              path="/monitor/notifications"
              element={<div>alerts page</div>}
            />
          </Route>
          <Route path="/unauthorized" element={<div>unauthorized</div>} />
        </>,
        {
          storeInitialState: createMockState({
            currentUser,
            settings: createMockSettingsState({ "has-user-setup": true }),
          }),
          withRouter: true,
          initialRoute: "/monitor/notifications",
        },
      );
    };

    it("renders the page for superusers", async () => {
      setup({ currentUser: createMockUser({ is_superuser: true }) });

      expect(await screen.findByText("alerts page")).toBeInTheDocument();
    });

    it("redirects a non-admin with monitoring permission to unauthorized without redirect-back", async () => {
      const { router } = setup({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: false,
          permissions: { can_access_monitoring: true },
        }),
      });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/unauthorized");
      });

      expect(router?.location.search).toBe("");
      expect(screen.queryByText("alerts page")).not.toBeInTheDocument();
    });

    it("redirects an analyst to unauthorized without redirect-back", async () => {
      const { router } = setup({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: true,
        }),
      });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/unauthorized");
      });

      expect(router?.location.search).toBe("");
      expect(screen.queryByText("alerts page")).not.toBeInTheDocument();
    });
  });
  describe("CanAccessAiAuditing", () => {
    interface SetupOpts {
      currentUser?: ReturnType<typeof createMockUser>;
    }

    const setup = ({ currentUser }: SetupOpts = {}) => {
      return renderWithProviders(
        <>
          <Route element={<CanAccessAiAuditing />}>
            <Route
              path="/monitor/ai-auditing/usage"
              element={<div>ai auditing page</div>}
            />
          </Route>
          <Route path="/unauthorized" element={<div>unauthorized</div>} />
        </>,
        {
          storeInitialState: createMockState({
            currentUser,
            settings: createMockSettingsState({ "has-user-setup": true }),
          }),
          withRouter: true,
          initialRoute: "/monitor/ai-auditing/usage",
        },
      );
    };

    it("renders the page for superusers", async () => {
      setup({ currentUser: createMockUser({ is_superuser: true }) });

      expect(await screen.findByText("ai auditing page")).toBeInTheDocument();
    });

    it("redirects a non-admin with monitoring permission to unauthorized without redirect-back", async () => {
      const { router } = setup({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: false,
          permissions: { can_access_monitoring: true },
        }),
      });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/unauthorized");
      });

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({});
      expect(screen.queryByText("ai auditing page")).not.toBeInTheDocument();
    });

    it("redirects an analyst to unauthorized without redirect-back", async () => {
      const { router } = setup({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: true,
        }),
      });

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/unauthorized");
      });

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({});
      expect(screen.queryByText("ai auditing page")).not.toBeInTheDocument();
    });
  });
});
