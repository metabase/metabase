import userEvent from "@testing-library/user-event";

import { setupBugReportingDetailsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { AdminPath } from "metabase/redux/store";
import { Route } from "metabase/router";
import {
  createMockSettings,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";

import { AdminNavbar } from "./AdminNavbar";

// The real tab list and its order live with `getAdminPaths`, which pins them in
// its own spec. Here the list is a fixture: what matters is that digit N routes
// to the Nth tab, whatever the tabs happen to be.
const ADMIN_PATHS: AdminPath[] = [
  { key: "settings", path: "/admin/settings", getName: () => "Settings" },
  { key: "databases", path: "/admin/databases", getName: () => "Databases" },
  { key: "people", path: "/admin/people", getName: () => "People" },
];

type SetupOpts = {
  isAdmin?: boolean;
  isPaidPlan?: boolean;
  adminPaths?: AdminPath[];
};

const setup = ({
  isAdmin = false,
  isPaidPlan = false,
  adminPaths = [],
}: SetupOpts) => {
  setupBugReportingDetailsEndpoint();
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings(
      createMockSettings({
        "token-status": createMockTokenStatus({ valid: isPaidPlan }),
      }),
    ),
  });

  return renderWithProviders(
    <Route
      path="*"
      element={<AdminNavbar path="/admin" adminPaths={adminPaths} />}
    />,
    {
      storeInitialState: state,
      withRouter: true,
      initialRoute: "/admin",
      withKBar: true,
    },
  );
};

const setupTabs = async (adminPaths: AdminPath[] = ADMIN_PATHS) => {
  const { router } = setup({ isAdmin: true, adminPaths });

  // The digit shortcut is registered from an effect; a keystroke dispatched in
  // the same tick as the initial render lands before that and is lost.
  await screen.findByTestId("admin-navbar");

  return { router };
};

describe("AdminNavbar", () => {
  describe("StoreLink visibility", () => {
    it("does not show store link when user is not an admin", () => {
      setup({ isAdmin: false, isPaidPlan: true });
      expect(screen.queryByTestId("store-link")).not.toBeInTheDocument();
    });

    it("shows store link when user is admin and not on paid plan", () => {
      setup({ isAdmin: true, isPaidPlan: false });
      expect(screen.getByTestId("store-link")).toBeInTheDocument();
    });

    it("does not show store link when user is admin and on paid plan", () => {
      setup({ isAdmin: true, isPaidPlan: true });
      expect(screen.queryByTestId("store-link")).not.toBeInTheDocument();
    });
  });

  describe("tab shortcuts", () => {
    it.each(
      ADMIN_PATHS.map(
        (adminPath, index) =>
          [`${index + 1}`, adminPath.key, adminPath.path] as const,
      ),
    )("pressing %s goes to the %s tab", async (key, _key, pathname) => {
      const { router } = await setupTabs();

      await userEvent.keyboard(key);

      await waitFor(() => expect(router?.location.pathname).toBe(pathname));
    });

    it("ignores digits past the end of the tab list", async () => {
      const { router } = await setupTabs();

      await userEvent.keyboard(`${ADMIN_PATHS.length + 1}`);
      expect(router?.location.pathname).toBe("/admin");

      // The handler is live — the out-of-range digit was ignored, not dropped.
      await userEvent.keyboard("2");
      await waitFor(() =>
        expect(router?.location.pathname).toBe(ADMIN_PATHS[1].path),
      );
    });
  });
});
