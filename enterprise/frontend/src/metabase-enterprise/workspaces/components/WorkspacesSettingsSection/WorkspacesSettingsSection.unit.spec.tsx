import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { WorkspacesSettingsSection } from "./WorkspacesSettingsSection";

interface SetupOpts {
  workspacesEnabled?: boolean;
}

const setup = ({ workspacesEnabled = false }: SetupOpts = {}) => {
  const settings = createMockSettings({
    "workspaces-enabled": workspacesEnabled,
    "token-features": createMockTokenFeatures({ workspaces: true }),
  });

  setupEnterprisePlugins();
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(
    <>
      <WorkspacesSettingsSection />
      <UndoListing />
    </>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("WorkspacesSettingsSection", () => {
  it("renders the Workspaces section with the toggle checked when workspaces-enabled is true", async () => {
    setup({ workspacesEnabled: true });

    expect(await screen.findByText("Workspaces")).toBeInTheDocument();
    expect(await screen.findByText("Enable workspaces")).toBeInTheDocument();
    expect(await screen.findByRole("switch")).toBeChecked();
  });

  it("renders the toggle unchecked when workspaces-enabled is false", async () => {
    setup({ workspacesEnabled: false });

    expect(await screen.findByRole("switch")).not.toBeChecked();
  });

  it("PUTs the setting when the toggle is turned on", async () => {
    setup({ workspacesEnabled: false });

    const toggle = await screen.findByRole("switch");
    await userEvent.click(toggle);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/workspaces-enabled");
    expect(body).toStrictEqual({ value: true });
  });
});
