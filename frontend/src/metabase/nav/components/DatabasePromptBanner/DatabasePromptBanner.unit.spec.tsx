import { Route } from "react-router";

import fetchMock from "fetch-mock";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { TokenFeatures } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";

import { DatabasePromptBanner } from "./DatabasePromptBanner";

interface SetupOpts {
  isAdmin?: boolean;
  isPaidPlan?: boolean;
  onlyHaveSampleDatabase?: boolean;
  isWhiteLabeling?: boolean;
  isOnAdminAddDatabasePage?: boolean;
}
const TEST_DB = createSampleDatabase();

const DATA_WAREHOUSE_DB = createMockDatabase({ id: 2 });

function setup({
  isAdmin = false,
  isPaidPlan = false,
  onlyHaveSampleDatabase = false,
  isWhiteLabeling = false,
  isOnAdminAddDatabasePage = false,
}: SetupOpts = {}) {
  setupEnterpriseTest();

  if (onlyHaveSampleDatabase) {
    setupDatabasesEndpoints([TEST_DB]);
  } else {
    setupDatabasesEndpoints([TEST_DB, DATA_WAREHOUSE_DB]);
  }

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures(
        isPaidPlan ? randomizePaidPlanFeatures() : {},
      ),
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
}

describe("DatabasePromptBanner", () => {
  it("should not render for non-admin users without paid plan without connected databases", () => {
    setup({
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

  it("should not render for admin users without paid plan or connected databases", () => {
    setup({
      isAdmin: true,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for paid-plan instance without being an admin or connected databases", () => {
    setup({
      isPaidPlan: true,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for instance with only sample database without being an admin or without paid plan", () => {
    setup({
      onlyHaveSampleDatabase: true,
    });

    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not render for admin users with paid plan but with connected databases", () => {
    setup({
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

  it("should not render for admin users without connected databases but without paid plan", () => {
    setup({
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

  it("should not render for instance with paid plan and without connected databases but without being an admin user", () => {
    setup({
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

  it("should not render for admin users with paid plan without connected databases, but is white labeling", async () => {
    setup({
      isAdmin: true,
      isPaidPlan: true,
      onlyHaveSampleDatabase: true,
      isWhiteLabeling: true,
    });

    // This ensures the conditions for database prompt banner are all available.
    // Then we could safely assert that the banner is not rendered.
    // If we don't wait for this API call to finish, the banner could have rendered,
    // and the test would still pass.
    await waitFor(() => {
      expect(fetchMock.called("path:/api/database")).toBe(true);
    });
    expect(
      screen.queryByText(
        "Connect to your database to get the most from Metabase.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should render for admin users with paid plan without connected databases", async () => {
    setup({
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
      "https://metabase.com/help/connect",
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
    setup({
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
      "https://metabase.com/help/connect",
    );

    expect(
      screen.queryByRole("link", {
        name: "Connect your database",
      }),
    ).not.toBeInTheDocument();
  });
});

function randomizePaidPlanFeatures(): Partial<TokenFeatures> {
  const features: Partial<TokenFeatures> = {};
  if (Math.random() > 0.5) {
    features.sso = true;
  } else {
    features.hosting = true;
  }

  return features;
}
