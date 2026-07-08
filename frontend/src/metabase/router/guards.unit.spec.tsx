import { renderWithProviders, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import {
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
  isBackendOnlyPath,
} from "./guards";
import { Route } from "./react-router";

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

  describe("IsAdmin", () => {
    it("redirects a non-admin user to /unauthorized", async () => {
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: false }),
        settings: createMockSettingsState({ "has-user-setup": true }),
      });

      const { history } = renderWithProviders(
        <>
          <Route component={IsAdmin}>
            <Route path="/admin/settings" component={Protected} />
          </Route>
          <Route path="/unauthorized" component={Unauthorized} />
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
          <Route component={IsNotAuthenticated}>
            <Route path="/auth/login" component={LoginPage} />
          </Route>
          <Route path="/" component={Home} />
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
