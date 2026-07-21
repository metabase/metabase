import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { setBasename } from "metabase/utils/basename";
import { replaceLocation } from "metabase/utils/dom";
import { createMockUser } from "metabase-types/api/mocks";

import {
  CanAccessAiAuditing,
  CanAccessAlertsManagement,
  CanAccessMonitor,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
  isBackendOnlyPath,
} from "./guards";
import { Route } from "./route";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  replaceLocation: jest.fn(),
}));

const Protected = () => <div>protected</div>;
const LoginPage = () => <div>login page</div>;
const Unauthorized = () => <div>unauthorized</div>;
const Home = () => <div>home</div>;

describe("route-guards", () => {
  describe("redirect-after-login flow (UXW-3939)", () => {
    it("UserIsAuthenticated should preserve original path as ?redirect= when sending logged-out user to /auth/login", async () => {
      const state = createMockState({
        currentUser: undefined,
        settings: createMockSettingsState({ "has-user-setup": true }),
      });

      const Dashboard = () => <div>protected dashboard</div>;

      const { history } = renderWithProviders(
        <>
          <Route element={<IsAuthenticated />}>
            <Route path="/dashboard/:slug" element={<Dashboard />} />
          </Route>
          <Route element={<IsNotAuthenticated />}>
            <Route path="/auth/login" element={<LoginPage />} />
          </Route>
        </>,
        {
          storeInitialState: state,
          withRouter: true,
          initialRoute: "/dashboard/123",
        },
      );

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
      });

      const location = history!.getCurrentLocation();
      expect(location.query).toEqual(
        expect.objectContaining({ redirect: "/dashboard/123" }),
      );
      expect(location.search).toContain("redirect");
    });
  });

  describe("IsAdmin", () => {
    it("redirects a non-admin user to /unauthorized", async () => {
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: false }),
        settings: createMockSettingsState({ "has-user-setup": true }),
      });

      const { history } = renderWithProviders(
        <>
          <Route element={<IsAdmin />}>
            <Route path="/admin/settings" element={<Protected />} />
          </Route>
          <Route path="/unauthorized" element={<Unauthorized />} />
        </>,
        {
          storeInitialState: state,
          withRouter: true,
          initialRoute: "/admin/settings",
        },
      );

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/unauthorized");
      });
    });
  });

  describe("IsNotAuthenticated", () => {
    it("bounces a logged-in user off /auth/login", async () => {
      const state = createMockState({
        currentUser: createMockUser(),
        auth: { loginPending: false, redirect: true },
        settings: createMockSettingsState({ "has-user-setup": true }),
      });

      const { history } = renderWithProviders(
        <>
          <Route element={<IsNotAuthenticated />}>
            <Route path="/auth/login" element={<LoginPage />} />
          </Route>
          <Route path="/" element={<Home />} />
        </>,
        {
          storeInitialState: state,
          withRouter: true,
          initialRoute: "/auth/login",
        },
      );

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/");
      });
    });
  });

  describe("IsNotAuthenticated redirect targets", () => {
    const ORIGIN = "http://localhost";
    const replaceLocationMock = jest.mocked(replaceLocation);

    const setup = (redirectParam: string) => {
      window.history.replaceState(
        {},
        "",
        `/auth/login?redirect=${encodeURIComponent(redirectParam)}`,
      );

      const state = createMockState({
        currentUser: createMockUser(),
        auth: { loginPending: false, redirect: true },
        settings: createMockSettingsState({ "has-user-setup": true }),
      });

      const { history } = renderWithProviders(
        <Route element={<IsNotAuthenticated />}>
          <Route path="/auth/login" element={<LoginPage />} />
        </Route>,
        {
          storeInitialState: state,
          withRouter: true,
          initialRoute: "/auth/login",
        },
      );

      return { history };
    };

    afterEach(() => {
      replaceLocationMock.mockClear();
      window.history.replaceState({}, "", "/");
      // reset the global MetabaseSettings singleton mutated by mockSettings
      mockSettings();
      setBasename("");
    });

    it("does a full-page redirect for a relative backend-only path", async () => {
      const { history } = setup("/auth/sso/google");

      await waitFor(() => {
        expect(replaceLocationMock).toHaveBeenCalledWith(
          `${ORIGIN}/auth/sso/google`,
        );
      });
      expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
    });

    it("normalizes a relative backend-only target without a leading slash", async () => {
      const { history } = setup("auth/sso/google");

      await waitFor(() => {
        expect(replaceLocationMock).toHaveBeenCalledWith(
          `${ORIGIN}/auth/sso/google`,
        );
      });
      expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
    });

    it("does a full-page redirect for an absolute same-origin backend-only URL", async () => {
      const { history } = setup(`${ORIGIN}/auth/sso/google`);

      await waitFor(() => {
        expect(replaceLocationMock).toHaveBeenCalledWith(
          `${ORIGIN}/auth/sso/google`,
        );
      });
      expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
    });

    it("navigates in-app to the path of an absolute same-origin URL", async () => {
      const { history } = setup(`${ORIGIN}/dashboard/1`);

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/dashboard/1");
      });
      expect(replaceLocationMock).not.toHaveBeenCalled();
    });

    it("does a full-page redirect for a site-url URL on another origin", async () => {
      const siteUrl = "https://metabase.example.com";
      mockSettings({ "site-url": siteUrl });

      const { history } = setup(`${siteUrl}/dashboard/1`);

      await waitFor(() => {
        expect(replaceLocationMock).toHaveBeenCalledWith(
          `${siteUrl}/dashboard/1`,
        );
      });
      expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
    });

    describe("when Metabase is hosted under a subpath (GIT-10551)", () => {
      beforeEach(() => {
        setBasename("/metabase");
      });

      it("prefixes the subpath on a full-page redirect to a backend-only path", async () => {
        const { history } = setup("/oauth/authorize?client_id=abc");

        await waitFor(() => {
          expect(replaceLocationMock).toHaveBeenCalledWith(
            `${ORIGIN}/metabase/oauth/authorize?client_id=abc`,
          );
        });
        expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
      });

      it("does not double the subpath when navigating in-app", async () => {
        const { history } = setup("/dashboard/1");

        await waitFor(() => {
          expect(history?.getCurrentLocation().pathname).toBe("/dashboard/1");
        });
        expect(replaceLocationMock).not.toHaveBeenCalled();
      });

      it("recognizes a backend-only path behind the subpath in an absolute URL", async () => {
        const { history } = setup(`${ORIGIN}/metabase/oauth/authorize`);

        await waitFor(() => {
          expect(replaceLocationMock).toHaveBeenCalledWith(
            `${ORIGIN}/metabase/oauth/authorize`,
          );
        });
        expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
      });

      it("does not strip a lookalike path prefix that is not the basename", async () => {
        const { history } = setup(`${ORIGIN}/metabase-docs/foo`);

        await waitFor(() => {
          expect(history?.getCurrentLocation().pathname).toBe(
            "/metabase-docs/foo",
          );
        });
        expect(replaceLocationMock).not.toHaveBeenCalled();
      });

      it("handles a nested subpath basename", async () => {
        setBasename("/bi/metabase");
        const { history } = setup("/oauth/authorize?client_id=abc");

        await waitFor(() => {
          expect(replaceLocationMock).toHaveBeenCalledWith(
            `${ORIGIN}/bi/metabase/oauth/authorize?client_id=abc`,
          );
        });
        expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
      });
    });
  });

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
      const { history } = setup({ currentUser: undefined });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
      });

      expect(history?.getCurrentLocation().query).toEqual(
        expect.objectContaining({ redirect: "/monitor" }),
      );
    });

    it("redirects users without monitor access to unauthorized", async () => {
      const { history } = setup({
        currentUser: createMockUser({
          is_data_analyst: false,
          is_superuser: false,
        }),
      });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/unauthorized");
      });

      expect(history?.getCurrentLocation().query).toEqual({});
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
      const { history } = setup({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: false,
          permissions: { can_access_monitoring: true },
        }),
      });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/unauthorized");
      });

      expect(history?.getCurrentLocation().query).toEqual({});
      expect(screen.queryByText("alerts page")).not.toBeInTheDocument();
    });

    it("redirects an analyst to unauthorized without redirect-back", async () => {
      const { history } = setup({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: true,
        }),
      });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/unauthorized");
      });

      expect(history?.getCurrentLocation().query).toEqual({});
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
              path="/monitor/ai-auditing"
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
          initialRoute: "/monitor/ai-auditing",
        },
      );
    };

    it("renders the page for superusers", async () => {
      setup({ currentUser: createMockUser({ is_superuser: true }) });

      expect(await screen.findByText("ai auditing page")).toBeInTheDocument();
    });

    it("redirects a non-admin with monitoring permission to unauthorized without redirect-back", async () => {
      const { history } = setup({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: false,
          permissions: { can_access_monitoring: true },
        }),
      });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/unauthorized");
      });

      expect(history?.getCurrentLocation().query).toEqual({});
      expect(screen.queryByText("ai auditing page")).not.toBeInTheDocument();
    });

    it("redirects an analyst to unauthorized without redirect-back", async () => {
      const { history } = setup({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: true,
        }),
      });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/unauthorized");
      });

      expect(history?.getCurrentLocation().query).toEqual({});
      expect(screen.queryByText("ai auditing page")).not.toBeInTheDocument();
    });
  });

  describe("isBackendOnlyPath", () => {
    it("should return true for /oauth/ paths", () => {
      expect(isBackendOnlyPath("/oauth/authorize")).toBe(true);
      expect(isBackendOnlyPath("/oauth/authorize/decision")).toBe(true);
      expect(isBackendOnlyPath("/oauth/token")).toBe(true);
    });

    it("should return true for /auth/sso/ paths", () => {
      expect(isBackendOnlyPath("/auth/sso/slack-connect")).toBe(true);
      expect(isBackendOnlyPath("/auth/sso/slack-connect/callback")).toBe(true);
      expect(isBackendOnlyPath("/auth/sso/my-provider")).toBe(true);
    });

    it("should return false for frontend paths", () => {
      expect(isBackendOnlyPath("/")).toBe(false);
      expect(isBackendOnlyPath("/auth/login")).toBe(false);
      expect(isBackendOnlyPath("/collection/root")).toBe(false);
      expect(isBackendOnlyPath("/question/1")).toBe(false);
    });

    it("should not match partial prefixes", () => {
      expect(isBackendOnlyPath("/oauthx/foo")).toBe(false);
    });
  });
});
