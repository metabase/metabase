import { type Context, createContext } from "react";
import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { metabaseReduxContext } from "metabase/redux/context";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import {
  CanAccessAlertsManagement,
  CanAccessMonitor,
  IsAuthenticated,
  IsNotAuthenticated,
  isBackendOnlyPath,
} from "./route-guards";

describe("route-guards", () => {
  describe("patched redux-auth-wrapper", () => {
    it("connectedReduxRedirect should throw an error if no context is provided", async () => {
      expect(() => connectedReduxRedirect({} as any)).toThrow(
        "you must provide a custom context",
      );
    });

    it("connectedReduxRedirect should be able to use same context as the main application", async () => {
      let selectorState: any;
      const RouteGuard = setupRouteGuard({
        // leverage the same context used by the main application
        context: metabaseReduxContext,
        authenticatedSelector: (state) => {
          selectorState = state;
          return !!state.auth.VAL_ONLY_IN_THIS_CTX;
        },
      });

      const text = "User can see since context is shared";
      const state = { auth: { VAL_ONLY_IN_THIS_CTX: true } };
      renderWithProviders(<RouteGuard>{text}</RouteGuard>, {
        storeInitialState: createMockState(state as any),
      });

      expect(selectorState.auth.VAL_ONLY_IN_THIS_CTX).toBe(true);
      expect(screen.getByText(text)).toBeInTheDocument();
    });

    it("connectedReduxRedirect should be able to use a different context than the main application", async () => {
      let selectorState: any;
      const RouteGuard = setupRouteGuard({
        // provide a different context than the one that will get created within renderWithProviders
        context: createContext({
          store: {
            dispatch: () => {},
            subscribe: () => {},
            getState: () => ({ auth: { VAL_ONLY_IN_THIS_CTX: false } }),
          },
        }),
        authenticatedSelector: (state) => {
          selectorState = state;
          return !!state.auth.VAL_ONLY_IN_THIS_CTX;
        },
      });

      const text = "User should not be able to see this";
      const state = { auth: { VAL_ONLY_IN_THIS_CTX: true } };
      renderWithProviders(<RouteGuard>{text}</RouteGuard>, {
        storeInitialState: createMockState(state as any),
      });

      expect(selectorState.auth.VAL_ONLY_IN_THIS_CTX).toBe(false);
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });
  });

  describe("redirect-after-login flow (UXW-3939)", () => {
    it("UserIsAuthenticated should preserve original path as ?redirect= when sending logged-out user to /auth/login", async () => {
      const state = createMockState({
        currentUser: undefined,
        settings: createMockSettingsState({ "has-user-setup": true }),
      });

      const Dashboard = () => <div>protected dashboard</div>;
      const LoginPage = () => <div>login page</div>;

      const { history } = renderWithProviders(
        <>
          <Route component={IsAuthenticated}>
            <Route path="/dashboard/:slug" component={Dashboard} />
          </Route>
          <Route component={IsNotAuthenticated}>
            <Route path="/auth/login" component={LoginPage} />
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

  describe("CanAccessMonitor", () => {
    interface SetupOpts {
      currentUser?: ReturnType<typeof createMockUser>;
    }

    const setup = ({ currentUser }: SetupOpts = {}) => {
      return renderWithProviders(
        <>
          <Route component={CanAccessMonitor}>
            <Route path="/monitor" component={() => <div>monitor page</div>} />
          </Route>
          <Route path="/auth/login" component={() => <div>login page</div>} />
          <Route
            path="/unauthorized"
            component={() => <div>unauthorized</div>}
          />
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
          <Route component={CanAccessAlertsManagement}>
            <Route
              path="/monitor/notifications"
              component={() => <div>alerts page</div>}
            />
          </Route>
          <Route
            path="/unauthorized"
            component={() => <div>unauthorized</div>}
          />
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

function setupRouteGuard(opts: {
  context: Context<any>;
  authenticatedSelector: (state: any) => boolean;
}) {
  const RouteGuard = connectedReduxRedirect<any, any>({
    wrapperDisplayName: "testing",
    redirectPath: "/test",
    allowRedirectBack: false,
    redirectAction: routerActions.replace,
    ...opts,
  });

  return RouteGuard(({ children }: any) => children);
}
