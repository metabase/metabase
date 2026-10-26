import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { WhiteLabelBrandingSettingsPage } from "./WhiteLabelBrandingSettingsPage";

interface SetupOpts {
  loadingMessage?: EnterpriseSettings["loading-message"];
}

const setup = async ({ loadingMessage }: SetupOpts = {}) => {
  const settings = createMockSettings({ "loading-message": loadingMessage });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "login-page-illustration",
      description: "Login page illustration",
    }),
  ]);
  setupUpdateSettingEndpoint();

  renderWithProviders(
    <>
      <WhiteLabelBrandingSettingsPage />
      <UndoListing />
    </>,
  );

  await screen.findByText("Branding");
};

describe("branding settings", () => {
  const brandingSettings = [
    "Color palette",
    "User interface colors",
    "Chart colors",
    "Logo",
    "Font",
    "Favicon",
    "Loading message",
  ];

  it.each(brandingSettings)("renders %s", async (setting) => {
    await setup();

    expect((await screen.findAllByText(setting)).length).toBeGreaterThan(0);
  });

  it.each([
    ["Loading results...", "loading-results", "doing-science"],
    ["Running query...", "running-query", "doing-science"],
    ["Doing science...", "doing-science", "loading-results"],
  ] as const)(
    "should save %s as the loading message",
    async (label, value, initialValue) => {
      await setup({ loadingMessage: initialValue });

      await userEvent.click(await screen.findByLabelText("Loading message"));
      await userEvent.click(await screen.findByRole("option", { name: label }));

      const [{ url, body }] = await findRequests("PUT");
      expect(url).toMatch(/loading-message/);
      expect(body).toEqual({ value });
    },
  );
});
