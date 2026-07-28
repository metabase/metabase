import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { SettingsPage } from "./SettingsPage";

const TRANSFORMS_ENABLED_PATH = "path:/api/setting/transforms-enabled";

interface SetupOpts {
  isAdmin?: boolean;
  transformsEnabled?: boolean;
  transformsSetupComplete?: boolean;
}

const setup = ({
  isAdmin = true,
  transformsEnabled = false,
  transformsSetupComplete = true,
}: SetupOpts = {}) => {
  const settingsValues = createMockSettings({
    "transforms-enabled": transformsEnabled,
    "transforms-setup-complete": transformsSetupComplete,
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingsValues);

  renderWithProviders(
    <Route
      path="/"
      element={
        <div>
          <SettingsPage />
          <UndoListing />
        </div>
      }
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: mockSettings(settingsValues),
      }),
      withRouter: true,
    },
  );
};

describe("SettingsPage", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should show an empty state when there are no settings to configure", () => {
    setup({ isAdmin: false });

    expect(screen.getByText("Nothing to configure yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "There aren't any settings for you to change right now.",
      ),
    ).toBeInTheDocument();
  });

  it("should show an empty state when transforms setup is incomplete", () => {
    setup({ transformsSetupComplete: false });

    expect(screen.getByText("Nothing to configure yet")).toBeInTheDocument();
  });

  it("should render the transforms setting for admins after setup is complete", () => {
    setup();

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Transforms")).toBeInTheDocument();
    expect(
      screen.getByText(/When enabled, data analysts and admins can write/),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("should optimistically update the switch and persist on success", async () => {
    setup();
    setupUpdateSettingEndpoint({ status: 204 });

    const toggle = screen.getByRole("switch");
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    expect(toggle).toBeChecked();

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toContain("/api/setting/transforms-enabled");
      expect(puts[0].body).toEqual({ value: true });
    });

    expect(toggle).toBeChecked();
  });

  it("should revert the switch and show a toast when the backend update fails", async () => {
    setup({ transformsEnabled: true });
    fetchMock.put(TRANSFORMS_ENABLED_PATH, 400);

    const toggle = screen.getByRole("switch");
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toEqual({ value: false });
    });

    expect(toggle).toBeChecked();
    expect(
      await screen.findByText("Failed to update setting"),
    ).toBeInTheDocument();
  });
});
