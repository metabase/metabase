import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { createMockState } from "metabase-types/store/mocks";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import type { TokenStatusStatus } from "metabase-types/api";

import { AppBanner } from "./AppBanner";

interface SetupOpts {
  isAdmin: boolean;
  tokenStatusStatus: TokenStatusStatus;
  shouldShowDatabasePromptBanner: boolean;
}
const TEST_DB = createSampleDatabase();

const DATA_WAREHOUSE_DB = createMockDatabase({ id: 2 });

function setup({
  isAdmin,
  tokenStatusStatus,
  shouldShowDatabasePromptBanner,
}: SetupOpts) {
  if (shouldShowDatabasePromptBanner) {
    setupDatabasesEndpoints([TEST_DB]);
  } else {
    setupDatabasesEndpoints([TEST_DB, DATA_WAREHOUSE_DB]);
  }

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-status": { status: tokenStatusStatus },
      "token-features": createMockTokenFeatures({
        sso: shouldShowDatabasePromptBanner ? true : false,
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
  it.each([
    {
      shouldShowDatabasePromptBanner: true,
    },
    {
      shouldShowDatabasePromptBanner: false,
    },
  ])(
    "should render past-due banner for admin user with tokenStatusStatus: past-due, shouldShowDatabasePromptBanner: $shouldShowDatabasePromptBanner",
    ({ shouldShowDatabasePromptBanner }) => {
      setup({
        isAdmin: true,
        tokenStatusStatus: "past-due",
        shouldShowDatabasePromptBanner,
      });

      expect(
        screen.getByText(/We couldn't process payment for your account\./),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          /Pro features won’t work right now due to lack of payment\./,
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "Connect to your database to get the most from Metabase.",
        ),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    {
      shouldShowDatabasePromptBanner: true,
    },
    {
      shouldShowDatabasePromptBanner: false,
    },
  ])(
    "should render unpaid banner for admin user with tokenStatusStatus: unpaid, shouldShowDatabasePromptBanner: $shouldShowDatabasePromptBanner",
    ({ shouldShowDatabasePromptBanner }) => {
      setup({
        isAdmin: true,
        tokenStatusStatus: "unpaid",
        shouldShowDatabasePromptBanner,
      });

      expect(
        screen.queryByText(/We couldn't process payment for your account\./),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /Pro features won’t work right now due to lack of payment\./,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          "Connect to your database to get the most from Metabase.",
        ),
      ).not.toBeInTheDocument();
    },
  );

  it("should render database prompt banner for admin user with tokenStatusStatus: something-else, shouldShowDatabasePromptBanner: true", async () => {
    setup({
      isAdmin: true,
      tokenStatusStatus: "something-else",
      shouldShowDatabasePromptBanner: true,
    });

    expect(
      screen.queryByText(/We couldn't process payment for your account\./),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Pro features won’t work right now due to lack of payment\./,
      ),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).toBeInTheDocument();
  });

  it("should not render for admin user with tokenStatusStatus: something-else, shouldShowDatabasePromptBanner: false", () => {
    setup({
      isAdmin: true,
      tokenStatusStatus: "something-else",
      shouldShowDatabasePromptBanner: false,
    });

    expect(
      screen.queryByText(/We couldn't process payment for your account\./),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Pro features won’t work right now due to lack of payment\./,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it.each([
    { tokenStatusStatus: "past-due", shouldShowDatabasePromptBanner: true },
    { tokenStatusStatus: "past-due", shouldShowDatabasePromptBanner: false },
    { tokenStatusStatus: "unpaid", shouldShowDatabasePromptBanner: true },
    { tokenStatusStatus: "unpaid", shouldShowDatabasePromptBanner: false },
    {
      tokenStatusStatus: "something-else",
      shouldShowDatabasePromptBanner: true,
    },
    {
      tokenStatusStatus: "something-else",
      shouldShowDatabasePromptBanner: false,
    },
  ] as const)(
    "should not render for non admin user with tokenStatusStatus: $tokenStatusStatus, shouldShowDatabasePromptBanner: $shouldShowDatabasePromptBanner",
    ({ tokenStatusStatus, shouldShowDatabasePromptBanner }) => {
      setup({
        isAdmin: false,
        tokenStatusStatus,
        shouldShowDatabasePromptBanner,
      });

      expect(
        screen.queryByText(/We couldn't process payment for your account\./),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          /Pro features won’t work right now due to lack of payment\./,
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "Connect to your database to get the most from Metabase.",
        ),
      ).not.toBeInTheDocument();
    },
  );
});
