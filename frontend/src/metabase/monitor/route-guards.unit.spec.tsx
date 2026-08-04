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
      const { history } = setup({ currentUser: undefined });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe("/auth/login");
      });

      expect(
        new URLSearchParams(history?.getCurrentLocation().search).get(
          "redirect",
        ),
      ).toBe("/monitor");
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

      expect(history?.getCurrentLocation().search).toBe("");
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

      expect(history?.getCurrentLocation().search).toBe("");
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

      expect(history?.getCurrentLocation().search).toBe("");
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

      expect(
        parseSearchQuery(history?.getCurrentLocation().search ?? ""),
      ).toEqual({});
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

      expect(
        parseSearchQuery(history?.getCurrentLocation().search ?? ""),
      ).toEqual({});
      expect(screen.queryByText("ai auditing page")).not.toBeInTheDocument();
    });
  });
});
