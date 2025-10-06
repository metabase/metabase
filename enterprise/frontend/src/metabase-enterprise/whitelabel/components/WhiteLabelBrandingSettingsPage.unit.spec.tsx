import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { WhiteLabelBrandingSettingsPage } from "./WhiteLabelBrandingSettingsPage";

const setup = async () => {
  const settings = createMockSettings({});

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "login-page-illustration",
      description: "Login page illustration",
    }),
  ]);

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
  ];

  it.each(brandingSettings)("renders %s", async (setting) => {
    await setup();

    expect((await screen.findAllByText(setting)).length).toBeGreaterThan(0);
  });
});
