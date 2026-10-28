import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { LoadingMessage } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { WhiteLabelBrandingSettingsPage } from "./WhiteLabelBrandingSettingsPage";

interface SetupOpts {
  loadingMessage?: LoadingMessage;
}

const setup = async ({ loadingMessage }: SetupOpts = {}) => {
  const settings = createMockSettings({
    ...(loadingMessage && { "loading-message": loadingMessage }),
  });

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
    { label: "Loading results...", value: "loading-results" },
    { label: "Running query...", value: "running-query" },
    { label: "Doing science...", value: "doing-science" },
  ] as const)("saves the $label loading message", async ({ label, value }) => {
    await setup({
      loadingMessage:
        value === "doing-science" ? "running-query" : "doing-science",
    });

    await userEvent.click(await screen.findByLabelText("Loading message"));
    await userEvent.click(await screen.findByRole("option", { name: label }));

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toMatch(/\/api\/setting\/loading-message$/);
    expect(puts[0].body).toEqual({ value });
  });
});
