import { Route } from "react-router";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenStatusStatus } from "metabase-types/api";
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
  tokenStatusStatus?: TokenStatusStatus;
  tokenError?: string;
}
const TEST_DB = createSampleDatabase();

const DATA_WAREHOUSE_DB = createMockDatabase({ id: 2 });

function setup({
  isAdmin,
  isHosted = false,
  tokenStatusStatus,
  tokenError,
  isReadOnly = false,
}: SetupOpts) {
  setupDatabasesEndpoints([TEST_DB, DATA_WAREHOUSE_DB]);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "is-hosted?": isHosted,
      "read-only-mode": isReadOnly,
      "token-status": createMockTokenStatus({
        status: tokenStatusStatus,
        valid: false,
        "error-details": tokenError,
      }),
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
    it("should render past-due banner for admin user with tokenStatusStatus: past-due", () => {
      setup({
        isAdmin: true,
        tokenStatusStatus: "past-due",
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
        tokenStatusStatus: "unpaid",
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
        tokenStatusStatus: "invalid",
        tokenError: "This is a critical damage.",
      });

      expect(
        screen.getByText(/This is a critical damage\./),
      ).toBeInTheDocument();
    });

    it("should not render for admin user with tokenStatusStatus: something-else", () => {
      setup({
        isAdmin: true,
        tokenStatusStatus: "something-else",
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it("should not render when token status is missing", () => {
      setup({
        isAdmin: true,
        tokenStatusStatus: undefined,
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it.each(["past-due", "unpaid", "invalid"])(
      "should not render for hosted instances for %s token status (metabase#50335)",
      status => {
        setup({
          isAdmin: true,
          isHosted: true,
          tokenStatusStatus: status,
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
});
