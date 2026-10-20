import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupDatabaseListEndpointError,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDatabase,
  createMockEngines,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseListApp } from "./DatabaseListApp";

interface SetupOpts {
  listErrorMessage?: string;
  hasAdvancedPermissions?: boolean;
}

const setup = ({
  listErrorMessage,
  hasAdvancedPermissions = false,
}: SetupOpts = {}) => {
  setupEnginesEndpoint({});
  if (listErrorMessage) {
    setupDatabaseListEndpointError({
      status: 500,
      body: { message: listErrorMessage },
    });
  } else {
    setupDatabaseListEndpoint([
      createMockDatabase({ id: 1, name: "Stubbed DB", is_stub: true }),
    ]);
  }
  setupEnginesEndpoint(createMockEngines());

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: hasAdvancedPermissions,
    }),
  });
  if (hasAdvancedPermissions) {
    setupEnterpriseOnlyPlugin("feature_level_permissions");
  }

  renderWithProviders(<DatabaseListApp />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings,
    }),
  });
};

const getListRequestParams = () => {
  const [call] = fetchMock.callHistory.calls("path:/api/database");
  return new URL(call.url).searchParams;
};

describe("DatabaseListApp", () => {
  it("requests stub databases so they can be listed", async () => {
    setup();

    expect(await screen.findByText("Stubbed DB")).toBeInTheDocument();
    expect(getListRequestParams().get("include_stubs")).toBe("true");
  });

  it("does not exclude uneditable details without advanced permissions", async () => {
    setup();

    expect(await screen.findByText("Stubbed DB")).toBeInTheDocument();
    expect(getListRequestParams().has("exclude_uneditable_details")).toBe(
      false,
    );
  });

  it("excludes uneditable details with advanced permissions", async () => {
    setup({ hasAdvancedPermissions: true });

    expect(await screen.findByText("Stubbed DB")).toBeInTheDocument();
    expect(getListRequestParams().get("exclude_uneditable_details")).toBe(
      "true",
    );
  });

  it.each([
    { hasAdvancedPermissions: false },
    { hasAdvancedPermissions: true },
  ])(
    "should handle a failure to `GET` the list of all databases (metabase#20471) (advanced permissions: $hasAdvancedPermissions)",
    async ({ hasAdvancedPermissions }) => {
      const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";
      setup({ listErrorMessage: errorMessage, hasAdvancedPermissions });

      expect(
        await screen.findByText(/Something.s gone wrong/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /We.ve run into an error\. You can try refreshing the page, or just go back\./,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).not.toBeVisible();

      await userEvent.click(screen.getByText("Show error details"));
      await waitFor(() => expect(screen.getByText(errorMessage)).toBeVisible());
    },
  );
});
