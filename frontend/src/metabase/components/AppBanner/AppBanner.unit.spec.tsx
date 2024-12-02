import { Route } from "react-router";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenStatus } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { AppBanner } from "./AppBanner";

interface SetupOpts {
  isAdmin: boolean;
  isHosted?: boolean;
  isReadOnly?: boolean;
  tokenStatus?: TokenStatus | null;
}
const TEST_DB = createSampleDatabase();

const DATA_WAREHOUSE_DB = createMockDatabase({ id: 2 });

function setup({
  isAdmin,
  isHosted = false,
  isReadOnly = false,
  tokenStatus,
}: SetupOpts) {
  setupDatabasesEndpoints([TEST_DB, DATA_WAREHOUSE_DB]);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "is-hosted?": isHosted,
      "read-only-mode": isReadOnly,
      "token-status": createMockTokenStatus(tokenStatus ?? {}),
    }),
  });

  renderWithProviders(<Route path="*" component={AppBanner} />, {
    initialRoute: "/",
    storeInitialState: state,
    withRouter: true,
  });
}

describe("AppBanner", () => {
  it("should not render for non admins", () => {
    setup({ isAdmin: false });

    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });

  describe("PaymentBanner", () => {
    const token = {
      valid: false,
      trial: false,
    };

    it("should render past-due banner for admin user with tokenStatusStatus: past-due", () => {
      setup({
        isAdmin: true,
        tokenStatus: { ...token, status: "past-due" },
      });

      expect(
        screen.getByText(/We couldn't process payment for your account\./),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          /Pro features won't work right now due to lack of payment\./,
        ),
      ).not.toBeInTheDocument();
    });

    it("should render unpaid banner for admin user with tokenStatusStatus: unpaid", () => {
      setup({
        isAdmin: true,
        tokenStatus: { ...token, status: "unpaid" },
      });

      expect(
        screen.queryByText(/We couldn't process payment for your account\./),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /Pro features won't work right now due to lack of payment\./,
        ),
      ).toBeInTheDocument();
    });

    it("should render an error with details when the token is `invalid`", () => {
      setup({
        isAdmin: true,
        tokenStatus: {
          ...token,
          status: "invalid",
          "error-details": "This is a critical damage.",
        },
      });

      expect(
        screen.getByText(/This is a critical damage\./),
      ).toBeInTheDocument();
    });

    it("should not render for admin user with tokenStatusStatus: something-else", () => {
      setup({
        isAdmin: true,
        tokenStatus: { ...token, status: "something-else" },
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it.each(["past-due", "unpaid", "invalid"])(
      "should not render for hosted instances for %s token status (metabase#50335)",
      status => {
        setup({
          isAdmin: true,
          isHosted: true,
          tokenStatus: { ...token, status },
        });

        expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
      },
    );
  });

  describe("ReadOnlyBanner", () => {
    it("should render if Metabase is in read-only mode", () => {
      setup({
        isAdmin: true,
        isReadOnly: true,
      });

      expect(
        screen.getByText(
          "Metabase is under maintenance and is operating in read-only mode. It should only take up to 30 minutes.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("TrialBanner", () => {
    const token = {
      status: "Token is valid",
      valid: true,
      trial: true,
    };

    it("should not render if there is no information about the token", () => {
      setup({
        isAdmin: true,
        isHosted: true,
        tokenStatus: null,
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it("should not render for self-hosted instances", () => {
      setup({
        isAdmin: true,
        isHosted: false,
        tokenStatus: token,
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it("should not render if token is not in trial", () => {
      setup({
        isAdmin: true,
        isHosted: true,
        tokenStatus: { ...token, trial: false },
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it("should not render if token expiry date is not present", () => {
      setup({
        isAdmin: true,
        isHosted: true,
        tokenStatus: { ...token, "valid-thru": undefined },
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it("should render if it is a valid instance in a trial period", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-12-15"));

      setup({
        isAdmin: true,
        isHosted: true,
        tokenStatus: {
          ...token,
          "valid-thru": "2024-12-31T23:00:00.000Z",
        },
      });

      expect(screen.getByTestId("app-banner")).toBeInTheDocument();
      jest.useRealTimers();
    });
  });
});
