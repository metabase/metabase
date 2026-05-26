import { type Context, createContext } from "react";
import { Route } from "react-router";
import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { metabaseReduxContext } from "metabase/redux/context";
import { createMockState } from "metabase/redux/store/mocks";

import {
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
      const settings = {
        "has-user-setup": true,
      } as any;
      const state = createMockState({
        currentUser: undefined,
        settings: { values: settings } as any,
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
