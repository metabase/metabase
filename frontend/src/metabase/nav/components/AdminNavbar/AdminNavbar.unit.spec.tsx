import { setupBugReportingDetailsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { AdminNavbar } from "./AdminNavbar";

const setup = ({ isAdmin = false, isPaidPlan = false }) => {
  setupBugReportingDetailsEndpoint();
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings(
      createMockSettings({
        "token-status": createMockTokenStatus({ valid: isPaidPlan }),
      }),
    ),
  });

  return renderWithProviders(<AdminNavbar path="/admin" adminPaths={[]} />, {
    storeInitialState: state,
  });
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
});
