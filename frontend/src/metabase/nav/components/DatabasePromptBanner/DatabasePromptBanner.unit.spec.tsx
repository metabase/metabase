import { Route } from "react-router";

import fetchMock from "fetch-mock";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";
import {
  createMockDatabase,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";

import { DatabasePromptBanner } from "./DatabasePromptBanner";

interface setupOpts {
  isAdmin?: boolean;
  isPaidPlan?: boolean;
  onlyHaveSampleDatabase?: boolean;
  isWhiteLabeling?: boolean;
  isOnAdminAddDatabasePage?: boolean;
}
const TEST_DB = createSampleDatabase();

const DATA_WAREHOUSE_DB = createMockDatabase({ id: 2 });

async function setup({
  isAdmin = false,
  isPaidPlan = false,
  onlyHaveSampleDatabase = false,
  isWhiteLabeling = false,
  isOnAdminAddDatabasePage = false,
}: setupOpts = {}) {
  if (onlyHaveSampleDatabase) {
    setupDatabasesEndpoints([TEST_DB]);
  } else {
    setupDatabasesEndpoints([TEST_DB, DATA_WAREHOUSE_DB]);
  }

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-status": createMockTokenStatus({ valid: isPaidPlan }),
      "application-name": isWhiteLabeling ? "Acme Corp." : "Metabase",
    }),
  });

  renderWithProviders(
    isOnAdminAddDatabasePage ? (
      <Route path="/admin/databases/create" component={DatabasePromptBanner} />
    ) : (
      <Route path="*" component={DatabasePromptBanner} />
    ),
    {
      initialRoute: isOnAdminAddDatabasePage ? "/admin/databases/create" : "/",
      storeInitialState: state,
      withRouter: true,
    },
  );

  // This check ensures the conditions for database prompt banner are all available.
  // Then we could safely assert that the banner is not rendered.
  // If we don't wait for this API call to finish, the banner could have rendered,
  // and the test would still pass.
  if (isAdmin && isPaidPlan && !isWhiteLabeling) {
    await waitFor(() => {
      expect(fetchMock.called("path:/api/database")).toBe(true);
    });
  }
}

describe("DatabasePromptBanner", () => {
  it("should not render for non-admin users without paid plan without connected databases", async () => {
    await setup({
      isAdmin: false,
      isPaidPlan: false,
      onlyHaveSampleDatabase: false,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for admin users without paid plan or connected databases", async () => {
    await setup({
      isAdmin: true,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for paid-plan instance without being an admin or connected databases", async () => {
    await setup({
      isPaidPlan: true,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for instance with only sample database without being an admin or without paid plan", async () => {
    await setup({
      onlyHaveSampleDatabase: true,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for admin users with paid plan but with connected databases", async () => {
    await setup({
      isAdmin: true,
      isPaidPlan: true,
      onlyHaveSampleDatabase: false,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for admin users without connected databases but without paid plan", async () => {
    await setup({
      isAdmin: true,
      isPaidPlan: false,
      onlyHaveSampleDatabase: true,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for instance with paid plan and without connected databases but without being an admin user", async () => {
    await setup({
      isAdmin: false,
      isPaidPlan: true,
      onlyHaveSampleDatabase: true,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should render for admin users with paid plan without connected databases", async () => {
    await setup({
      isAdmin: true,
      isPaidPlan: true,
      onlyHaveSampleDatabase: true,
    });

    expect(
      await screen.findByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).toBeInTheDocument();

    const getHelpLink = screen.getByRole("link", {
      name: "Get help connecting",
    });
    expect(getHelpLink).toBeInTheDocument();
    expect(getHelpLink).toHaveAttribute(
      "href",
      "https://metabase.com/help/connect?email=admin%40metabase.test&site_url=http%3A%2F%2Flocalhost%3A3000",
    );

    const connectDatabaseLink = screen.getByRole("link", {
      name: "Connect your database",
    });
    expect(connectDatabaseLink).toBeInTheDocument();
    expect(connectDatabaseLink).toHaveAttribute(
      "href",
      "/admin/databases/create",
    );
  });

  it("should render for admin users with paid plan without connected databases, but without connect your database button if users is on admin add database page", async () => {
    await setup({
      isAdmin: true,
      isPaidPlan: true,
      onlyHaveSampleDatabase: true,
      isOnAdminAddDatabasePage: true,
    });

    expect(
      await screen.findByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).toBeInTheDocument();

    const getHelpLink = screen.getByRole("link", {
      name: "Get help connecting",
    });
    expect(getHelpLink).toBeInTheDocument();
    expect(getHelpLink).toHaveAttribute(
      "href",
      "https://metabase.com/help/connect?email=admin%40metabase.test&site_url=http%3A%2F%2Flocalhost%3A3000",
    );

    expect(
      screen.queryByRole("link", {
        name: "Connect your database",
      }),
    ).not.toBeInTheDocument();
  });

  describe("EE", () => {
    beforeEach(() => {
      setupEnterpriseTest();
    });

    it("should not render for admin users with paid plan without connected databases, but is white labeling", async () => {
      await setup({
        isAdmin: true,
        isPaidPlan: true,
        onlyHaveSampleDatabase: true,
        isWhiteLabeling: true,
      });

      expect(
        screen.queryByText(
          "Connect to your database to get the most from Metabase.",
        ),
      ).not.toBeInTheDocument();
    });
  });
});
