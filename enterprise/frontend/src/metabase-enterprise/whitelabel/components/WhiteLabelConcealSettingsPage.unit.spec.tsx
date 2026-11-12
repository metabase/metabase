import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
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
  setupUpdateSettingEndpoint();

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
    "Application name",
    "Documentation and references",
    "Help link",
    "Metabase illustrations",
    "Metabot greeting",
    "Login and unsubscribe pages",
    "Landing page",
    "When calculations return no results",
    "When no objects can be found",
  ];

  it.each(concealMetabaseSettings)("renders %s", async (setting) => {
    await setup();

    expect((await screen.findAllByText(setting)).length).toBeGreaterThan(0);
  });

  it("saves the application name", async () => {
    await setup();

    const input = await screen.findByLabelText("Application name");
    await userEvent.clear(input);
    await userEvent.type(input, "New Test Co");
    fireEvent.blur(input);

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toContain("/api/setting/application-name");
    expect(puts[0].body).toEqual({ value: "New Test Co" });
  });
});
