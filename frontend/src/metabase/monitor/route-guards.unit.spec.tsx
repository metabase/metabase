import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { CanAccessAlertsManagement, CanAccessMonitor } from "./route-guards";

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
});
