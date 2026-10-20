import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockEngines,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseListApp } from "./DatabaseListApp";

const LIST_ERROR_MESSAGE = "Lorem ipsum dolor sit amet, consectetur adip";

interface SetupOpts {
  hasListError?: boolean;
  hasAdvancedPermissions?: boolean;
}

const setup = ({
  hasListError = false,
  hasAdvancedPermissions = false,
}: SetupOpts = {}) => {
  setupEnginesEndpoint(createMockEngines());
  if (hasListError) {
    fetchMock.get("path:/api/database", {
      status: 500,
      body: { message: LIST_ERROR_MESSAGE },
    });
  } else {
    setupDatabaseListEndpoint([
      createMockDatabase({ id: 1, name: "Stubbed DB", is_stub: true }),
    ]);
  }

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
    expect(getListRequestParams().has("exclude_uneditable_details")).toBe(
      false,
    );
  });

  it("excludes databases with uneditable details when advanced permissions are enabled", async () => {
    setup({ hasAdvancedPermissions: true });

    expect(await screen.findByText("Stubbed DB")).toBeInTheDocument();
    expect(getListRequestParams().get("exclude_uneditable_details")).toBe(
      "true",
    );
  });

  it("shows a generic error with hidden details when the databases fail to load (metabase#20471)", async () => {
    setup({ hasListError: true });

    expect(
      await screen.findByText(/Something.s gone wrong/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /We.ve run into an error\. You can try refreshing the page, or just go back\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(LIST_ERROR_MESSAGE)).not.toBeVisible();

    await userEvent.click(screen.getByText("Show error details"));
    expect(screen.getByText(LIST_ERROR_MESSAGE)).toBeVisible();
  });
});
