import { Route } from "react-router";

import { setupBugReportingDetailsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen } from "__support__/ui-with-store";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";

import { AdminNavbar } from "./AdminNavbar";

const setup = async ({ isAdmin = false, isPaidPlan = false }) => {
  setupBugReportingDetailsEndpoint();
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings(
      createMockSettings({
        "token-status": createMockTokenStatus({ valid: isPaidPlan }),
      }),
    ),
  });

  const view = renderWithProviders(
    <Route
      path="/"
      component={() => <AdminNavbar path="/admin" adminPaths={[]} />}
    />,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );
  await act(async () => {});
  return view;
};

describe("AdminNavbar", () => {
  describe("StoreLink visibility", () => {
    it("does not show store link when user is not an admin", async () => {
      await setup({ isAdmin: false, isPaidPlan: true });
      expect(screen.queryByTestId("store-link")).not.toBeInTheDocument();
    });

    it("shows store link when user is admin and not on paid plan", async () => {
      await setup({ isAdmin: true, isPaidPlan: false });
      expect(screen.getByTestId("store-link")).toBeInTheDocument();
    });

    it("does not show store link when user is admin and on paid plan", async () => {
      await setup({ isAdmin: true, isPaidPlan: true });
      expect(screen.queryByTestId("store-link")).not.toBeInTheDocument();
    });
  });
});
