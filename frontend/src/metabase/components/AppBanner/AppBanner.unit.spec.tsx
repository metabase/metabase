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
  tokenStatusStatus: TokenStatusStatus;
}
const TEST_DB = createSampleDatabase();

const DATA_WAREHOUSE_DB = createMockDatabase({ id: 2 });

function setup({ isAdmin, tokenStatusStatus }: SetupOpts) {
  setupDatabasesEndpoints([TEST_DB, DATA_WAREHOUSE_DB]);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-status": createMockTokenStatus({
        status: tokenStatusStatus,
        valid: false,
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
        /Pro features won’t work right now due to lack of payment\./,
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
        /Pro features won’t work right now due to lack of payment\./,
      ),
    ).toBeInTheDocument();
  });

  it("should not render for admin user with tokenStatusStatus: something-else", () => {
    setup({
      isAdmin: true,
      tokenStatusStatus: "something-else",
    });

    expect(
      screen.queryByText(/We couldn't process payment for your account\./),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Pro features won’t work right now due to lack of payment\./,
      ),
    ).not.toBeInTheDocument();
  });

  it.each([
    { tokenStatusStatus: "past-due" },
    { tokenStatusStatus: "unpaid" },
    {
      tokenStatusStatus: "something-else",
    },
  ] as const)(
    "should not render for non admin user with tokenStatusStatus: $tokenStatusStatus",
    ({ tokenStatusStatus }) => {
      setup({
        isAdmin: false,
        tokenStatusStatus,
      });
      expect(
        screen.queryByText(/We couldn't process payment for your account\./),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          /Pro features won’t work right now due to lack of payment\./,
        ),
      ).not.toBeInTheDocument();
    },
  );
});
