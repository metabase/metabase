import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { HelpLinkSettings } from "./HelpLinkSettings";

const setup = async (
  {
    settings: settingOverrides = {},
  }: {
    settings?: Partial<EnterpriseSettings>;
  } = { settings: {} },
) => {
  const settings = createMockSettings({
    "help-link": "metabase",
    "help-link-custom-destination": undefined,
    ...settingOverrides,
  });
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(<HelpLinkSettings />);

  await screen.findByText("Help link");
};

describe("HelpLinkSettings", () => {
  it("should show radio options", async () => {
    await setup();

    expect(screen.getByText("Link to Metabase help")).toBeInTheDocument();
    expect(screen.getByText("Hide it")).toBeInTheDocument();
    expect(
      screen.getByText("Go to a custom destination..."),
    ).toBeInTheDocument();
  });

  it("should not show text input when Metabase is selected", async () => {
    await setup({
      settings: {
        "help-link": "metabase",
        "help-link-custom-destination": undefined,
      },
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should show text input when custom is selected", async () => {
    await setup({
      settings: {
        "help-link": "custom",
        "help-link-custom-destination": "https://example.com/help",
      },
    });

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue("https://example.com/help"),
    ).toBeInTheDocument();
  });

  it("should fire PUT request when selecting a radio option", async () => {
    await setup({
      settings: {
        "help-link": "metabase",
      },
    });

    await userEvent.click(screen.getByText("Hide it"));
    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(/help-link/);
    expect(body).toEqual({
      value: "hidden",
    });
  });

  it("should validate a custom url", async () => {
    await setup({
      settings: {
        "help-link": "custom",
        "help-link-custom-destination": "https://example.com/help",
      },
    });

    const input = await screen.findByDisplayValue("https://example.com/help");

    // empty input
    await userEvent.clear(input);
    fireEvent.blur(input);
    expect(
      await screen.findByText("This field can't be left empty."),
    ).toBeInTheDocument();

    // invalid url
    await userEvent.type(input, "invalid-url");
    fireEvent.blur(input);
    expect(
      await screen.findByText(
        'This needs to be an "http://", "https://" or "mailto:" URL.',
      ),
    ).toBeInTheDocument();

    // shouldn't fire any PUT request
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(0);
  });

  it("should submit a custom url", async () => {
    await setup({
      settings: {
        "help-link": "custom",
        "help-link-custom-destination": "https://example.com/help",
      },
    });

    const input = await screen.findByDisplayValue("https://example.com/help");

    await userEvent.clear(input);
    await userEvent.type(input, "https://help.com/help");
    fireEvent.blur(input);
    await screen.findByDisplayValue("https://help.com/help");

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(/help-link-custom-destination/);
    expect(body).toEqual({
      value: "https://help.com/help",
    });
  });
});
