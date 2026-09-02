import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { AdminPath } from "metabase/redux/store";
import {
  createMockAdminAppState,
  createMockAdminState,
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { setBasename } from "metabase/utils/basename";
import { replaceLocation } from "metabase/utils/dom";
import { createMockUser } from "metabase-types/api/mocks";

import {
  CanAccessSettings,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
} from "./auth-guards";

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

      const { router } = renderWithProviders(
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
        expect(router?.location.pathname).toBe("/auth/login");
      });

      const location = router!.location;
      expect(new URLSearchParams(location.search).get("redirect")).toBe(
        "/dashboard/123",
      );
    });

    it("keeps the URL hash in ?redirect= so deep links (e.g. shared comment links) survive the login bounce", async () => {
      const state = createMockState({
        currentUser: undefined,
        settings: createMockSettingsState({ "has-user-setup": true }),
      });

      const { router } = renderWithProviders(
        <>
          <Route element={<IsAuthenticated />}>
            <Route path="/dashboard/:slug" element={<Protected />} />
          </Route>
          <Route element={<IsNotAuthenticated />}>
            <Route path="/auth/login" element={<LoginPage />} />
          </Route>
        </>,
        {
          storeInitialState: state,
          withRouter: true,
          initialRoute: "/dashboard/123?comments=true#comment-5",
        },
      );

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/auth/login");
      });

      expect(new URLSearchParams(router!.location.search).get("redirect")).toBe(
        "/dashboard/123?comments=true#comment-5",
      );
    });
  });

  describe("IsAdmin", () => {
    it("redirects a non-admin user to /unauthorized", async () => {
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: false }),
        settings: createMockSettingsState({ "has-user-setup": true }),
      });

      const { router } = renderWithProviders(
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
        expect(router?.location.pathname).toBe("/unauthorized");
      });
    });
  });

  describe("CanAccessSettings", () => {
    const DATABASES_PATH: AdminPath = {
      name: "Databases",
      path: "/admin/databases",
      key: "databases",
    };

    const setup = (paths: AdminPath[]) =>
      renderWithProviders(
        <>
          <Route element={<CanAccessSettings />}>
            <Route path="/admin/databases" element={<Protected />} />
          </Route>
          <Route path="/unauthorized" element={<Unauthorized />} />
        </>,
        {
          storeInitialState: createMockState({
            currentUser: createMockUser({ is_superuser: false }),
            settings: createMockSettingsState({ "has-user-setup": true }),
            admin: createMockAdminState({
              app: createMockAdminAppState({ paths }),
            }),
          }),
          withRouter: true,
          initialRoute: "/admin/databases",
        },
      );

    it("lets a non-admin through when a permission grant left them an admin path", async () => {
      const { router } = setup([DATABASES_PATH]);

      expect(await screen.findByText("protected")).toBeInTheDocument();
      expect(router?.location.pathname).toBe("/admin/databases");
    });

    it("redirects a non-admin with no admin paths to /unauthorized", async () => {
      const { router } = setup([]);

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/unauthorized");
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

      const { router } = renderWithProviders(
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
        expect(router?.location.pathname).toBe("/");
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

      const { router } = renderWithProviders(
        <Route element={<IsNotAuthenticated />}>
          <Route path="/auth/login" element={<LoginPage />} />
        </Route>,
        {
          storeInitialState: state,
          withRouter: true,
          initialRoute: "/auth/login",
        },
      );

      return { router };
    };

    afterEach(() => {
      replaceLocationMock.mockClear();
      window.history.replaceState({}, "", "/");
      // reset the global MetabaseSettings singleton mutated by mockSettings
      mockSettings();
      setBasename("");
    });

    it("does a full-page redirect for a relative backend-only path", async () => {
      const { router } = setup("/auth/sso/google");

      await waitFor(() => {
        expect(replaceLocationMock).toHaveBeenCalledWith(
          `${ORIGIN}/auth/sso/google`,
        );
      });
      expect(router?.location.pathname).toBe("/auth/login");
    });

    it("normalizes a relative backend-only target without a leading slash", async () => {
      const { router } = setup("auth/sso/google");

      await waitFor(() => {
        expect(replaceLocationMock).toHaveBeenCalledWith(
          `${ORIGIN}/auth/sso/google`,
        );
      });
      expect(router?.location.pathname).toBe("/auth/login");
    });

    it("does a full-page redirect for an absolute same-origin backend-only URL", async () => {
      const { router } = setup(`${ORIGIN}/auth/sso/google`);

      await waitFor(() => {
        expect(replaceLocationMock).toHaveBeenCalledWith(
          `${ORIGIN}/auth/sso/google`,
        );
      });
      expect(router?.location.pathname).toBe("/auth/login");
    });

    it("navigates in-app to the path of an absolute same-origin URL", async () => {
      const { router } = setup(`${ORIGIN}/dashboard/1`);

      await waitFor(() => {
        expect(router?.location.pathname).toBe("/dashboard/1");
      });
      expect(replaceLocationMock).not.toHaveBeenCalled();
    });

    it("does a full-page redirect for a site-url URL on another origin", async () => {
      const siteUrl = "https://metabase.example.com";
      mockSettings({ "site-url": siteUrl });

      const { router } = setup(`${siteUrl}/dashboard/1`);

      await waitFor(() => {
        expect(replaceLocationMock).toHaveBeenCalledWith(
          `${siteUrl}/dashboard/1`,
        );
      });
      expect(router?.location.pathname).toBe("/auth/login");
    });

    describe("when Metabase is hosted under a subpath (GIT-10551)", () => {
      beforeEach(() => {
        setBasename("/metabase");
      });

      it("prefixes the subpath on a full-page redirect to a backend-only path", async () => {
        const { router } = setup("/oauth/authorize?client_id=abc");

        await waitFor(() => {
          expect(replaceLocationMock).toHaveBeenCalledWith(
            `${ORIGIN}/metabase/oauth/authorize?client_id=abc`,
          );
        });
        expect(router?.location.pathname).toBe("/auth/login");
      });

      it("does not double the subpath when navigating in-app", async () => {
        const { router } = setup("/dashboard/1");

        await waitFor(() => {
          expect(router?.location.pathname).toBe("/dashboard/1");
        });
        expect(replaceLocationMock).not.toHaveBeenCalled();
      });

      it("recognizes a backend-only path behind the subpath in an absolute URL", async () => {
        const { router } = setup(`${ORIGIN}/metabase/oauth/authorize`);

        await waitFor(() => {
          expect(replaceLocationMock).toHaveBeenCalledWith(
            `${ORIGIN}/metabase/oauth/authorize`,
          );
        });
        expect(router?.location.pathname).toBe("/auth/login");
      });

      it("does not strip a lookalike path prefix that is not the basename", async () => {
        const { router } = setup(`${ORIGIN}/metabase-docs/foo`);

        await waitFor(() => {
          expect(router?.location.pathname).toBe("/metabase-docs/foo");
        });
        expect(replaceLocationMock).not.toHaveBeenCalled();
      });

      it("handles a nested subpath basename", async () => {
        setBasename("/bi/metabase");
        const { router } = setup("/oauth/authorize?client_id=abc");

        await waitFor(() => {
          expect(replaceLocationMock).toHaveBeenCalledWith(
            `${ORIGIN}/bi/metabase/oauth/authorize?client_id=abc`,
          );
        });
        expect(router?.location.pathname).toBe("/auth/login");
      });
    });
  });
});
