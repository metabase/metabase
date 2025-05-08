import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { WhiteLabelSettingsPage } from "./WhiteLabelSettingsPage";

const setup = async ({
  tab,
}: { tab?: "branding" | "conceal-metabase" } = {}) => {
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
      <WhiteLabelSettingsPage tab={tab} />
      <UndoListing />
    </>,
  );

  await screen.findByText("Branding");
};

describe("WhiteLabelSettingsPage", () => {
  it("renders tabs", async () => {
    await setup();

    expect(screen.getByText("Branding")).toBeInTheDocument();
    expect(screen.getByText("Conceal Metabase")).toBeInTheDocument();
  });

  it("renders branding tab by default", async () => {
    await setup();
    expect(screen.getByTestId("branding-settings")).toBeInTheDocument();
  });

  describe("branding settings", () => {
    const brandingSettings = [
      "Color Palette",
      "User interface colors",
      "Chart colors",
      "Logo",
      "Font",
      "Favicon",
    ];

    it.each(brandingSettings)("renders %s", async (setting) => {
      await setup({ tab: "branding" });

      expect((await screen.findAllByText(setting)).length).toBeGreaterThan(0);
    });
  });

  describe("conceal metabase settings", () => {
    const concealMetabaseSettings = [
      "Application Name",
      "Documentation and References",
      "Help link",
      "Metabase Illustrations",
      "Metabot greeting",
      "Login and unsubscribe pages",
      "Landing Page",
      "When calculations return no results",
      "When no objects can be found",
    ];

    it.each(concealMetabaseSettings)("renders %s", async (setting) => {
      await setup({ tab: "conceal-metabase" });

      expect((await screen.findAllByText(setting)).length).toBeGreaterThan(0);
    });
  });
});
