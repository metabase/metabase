import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { setupMetabotsEndpoint } from "__support__/server-mocks/metabot";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { MetabotGeneralSettingsPage } from "./MetabotGeneralSettingsPage";

const switchElement = () => screen.findByRole("switch");

const setup = async ({ metabotFeatureEnabled = true } = {}) => {
  setupEnterprisePlugins();
  setupPropertiesEndpoints(
    createMockSettings({
      "metabot-feature-enabled": metabotFeatureEnabled,
    }),
  );
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "metabot-feature-enabled",
      value: metabotFeatureEnabled,
    }),
  ]);
  setupUpdateSettingEndpoint();
  setupMetabotsEndpoint([]);

  renderWithProviders(
    <Route
      path="/admin/metabot/general"
      component={MetabotGeneralSettingsPage}
    />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot/general",
    },
  );

  await screen.findByText("Metabot");
};

describe("MetabotGeneralSettingsPage", () => {
  it("should render the page with Metabot settings", async () => {
    await setup();

    expect(await screen.findByText("Metabot")).toBeInTheDocument();
    expect(await screen.findByText("Enable Metabot")).toBeInTheDocument();
    expect(
      await screen.findByText(/Metabot is Metabase's AI assistant/),
    ).toBeInTheDocument();
  });

  it("should show switch as enabled when metabot-feature-enabled is true", async () => {
    await setup({ metabotFeatureEnabled: true });

    expect(await switchElement()).toBeChecked();
    expect(await screen.findByText("Metabot is enabled")).toBeInTheDocument();
  });

  it("should show switch as disabled when metabot-feature-enabled is false", async () => {
    await setup({ metabotFeatureEnabled: false });

    expect(await switchElement()).not.toBeChecked();
    expect(await screen.findByText("Metabot is disabled")).toBeInTheDocument();
  });

  it("should toggle the setting when switch is clicked", async () => {
    await setup({ metabotFeatureEnabled: false });

    const switchEl = await switchElement();
    expect(switchEl).not.toBeChecked();

    await userEvent.click(switchEl);

    // Verify the API call was made with correct payload
    const [putRequest] = await findRequests("PUT");
    expect(putRequest.url).toMatch(/api\/setting\/metabot-feature-enabled$/);
    expect(putRequest.body).toEqual({ value: true });
  });
});
