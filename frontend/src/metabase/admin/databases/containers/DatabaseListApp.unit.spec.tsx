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
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
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
  hasAdvancedPermissions,
}: SetupOpts = {}) => {
  setupEnginesEndpoint({});
  if (listErrorMessage) {
    setupDatabaseListEndpointError({ message: listErrorMessage });
  } else {
    setupDatabaseListEndpoint([
      createMockDatabase({ id: 1, name: "Stubbed DB", is_stub: true }),
    ]);
  }
  setupEnginesEndpoint(createMockEngines());

  if (hasAdvancedPermissions) {
    mockSettings({
      "token-features": createMockTokenFeatures({
        advanced_permissions: true,
      }),
    });
    setupEnterpriseOnlyPlugin("feature_level_permissions");
  }

  renderWithProviders(<DatabaseListApp />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    }),
  });
};

describe("DatabaseListApp", () => {
  afterEach(() => {
    reinitialize();
  });

  it("requests stub databases so they can be listed", async () => {
    setup();

    expect(await screen.findByText("Stubbed DB")).toBeInTheDocument();
    const [call] = fetchMock.callHistory.calls("path:/api/database");
    expect(new URL(call.url).searchParams.get("include_stubs")).toBe("true");
  });

  describe("when listing databases fails (metabase#20471)", () => {
    const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

    it("shows a generic error with collapsible details", async () => {
      setup({ listErrorMessage: errorMessage });

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

      expect(screen.getByText(errorMessage)).toBeVisible();
    });

    it("requests the list without uneditable details with advanced permissions", async () => {
      setup({ listErrorMessage: errorMessage, hasAdvancedPermissions: true });

      expect(
        await screen.findByText(/Something.s gone wrong/),
      ).toBeInTheDocument();
      const [call] = fetchMock.callHistory.calls("database-list-error");
      expect(
        new URL(call.url).searchParams.get("exclude_uneditable_details"),
      ).toBe("true");
    });
  });
});
