import { type Context, createContext } from "react";
import { Route } from "react-router";
import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import type { AdminPath } from "metabase-types/store";
import {
  createMockAdminAppState,
  createMockAdminState,
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { MetabaseReduxContext } from "./lib/redux";
import { CanAccessSettings } from "./route-guards";

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
        context: MetabaseReduxContext,
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

  describe("CanAccessSettings", () => {
    const DATABASES_PATH: AdminPath = {
      name: "Databases",
      path: "/admin/databases",
      key: "databases",
    };

    const Protected = () => <div>protected</div>;
    const Unauthorized = () => <div>unauthorized</div>;

    const setup = (paths: AdminPath[]) =>
      renderWithProviders(
        <>
          <Route component={CanAccessSettings}>
            <Route path="/admin/databases" component={Protected} />
          </Route>
          <Route path="/unauthorized" component={Unauthorized} />
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
      const { history } = setup([DATABASES_PATH]);

      expect(await screen.findByText("protected")).toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).toBe("/admin/databases");
    });

    it("redirects a non-admin with no admin paths to /unauthorized", async () => {
      const { history } = setup([]);

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/unauthorized");
      });
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
