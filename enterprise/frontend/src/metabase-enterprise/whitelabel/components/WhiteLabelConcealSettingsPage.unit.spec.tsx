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

import { WhiteLabelConcealSettingsPage } from "./WhiteLabelConcealSettingsPage";

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
      <WhiteLabelConcealSettingsPage />
      <UndoListing />
    </>,
  );

  await screen.findByText("Conceal Metabase");
};

describe("WhiteLabelConcealSettingsPage", () => {
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
    await setup();

    expect((await screen.findAllByText(setting)).length).toBeGreaterThan(0);
  });
});
