import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
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
  const settingValues = {
    "help-link": "metabase" as const,
    "help-link-custom-destination": undefined,
    ...settingOverrides,
  };
  setupPropertiesEndpoints(createMockSettings(settingValues));
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(<HelpLinkSettings />, {
    storeInitialState: { settings: createMockSettingsState(settingValues) },
  });

  await screen.findByText("Help link");
};

describe("HelpLinkSettings", () => {
  it("should show radio options", async () => {
    await setup();

    expect(
      screen.getByRole("radio", { name: "Link to Metabase help" }),
    ).toBeChecked();
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

    // unsupported protocol
    await userEvent.clear(input);
    await userEvent.type(input, "ftp://something");
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

  it("should show the error from the API and clear it after a valid save", async () => {
    await setup({
      settings: {
        "help-link": "custom",
        "help-link-custom-destination": "https://example.com/help",
      },
    });
    // The setting validation throws without a status code, so the API
    // responds with a 500 and the message in the body.
    setupUpdateSettingEndpoint({
      status: 500,
      body: { message: "Please make sure this is a valid URL" },
    });

    const input = await screen.findByDisplayValue("https://example.com/help");
    await userEvent.clear(input);
    await userEvent.type(input, "https://");
    fireEvent.blur(input);
    expect(
      await screen.findByText("Please make sure this is a valid URL"),
    ).toBeInTheDocument();

    setupUpdateSettingEndpoint();
    await userEvent.type(input, "example");
    fireEvent.blur(input);
    await waitFor(() =>
      expect(
        screen.queryByText("Please make sure this is a valid URL"),
      ).not.toBeInTheDocument(),
    );
    const puts = await findRequests("PUT");
    expect(puts.map(({ body }) => body)).toEqual([
      { value: "https://" },
      { value: "https://example" },
    ]);
  });

  it("should focus the URL input after choosing a custom destination", async () => {
    await setup();
    setupStatefulSettingsEndpoints({
      "help-link": "metabase",
      "help-link-custom-destination": "https://example.com/help",
    });

    await userEvent.click(
      screen.getByRole("radio", { name: "Go to a custom destination..." }),
    );

    expect(
      await screen.findByPlaceholderText("Enter a URL it should go to"),
    ).toHaveFocus();
  });

  it("should not focus the URL input on page load", async () => {
    await setup({
      settings: {
        "help-link": "custom",
        "help-link-custom-destination": "https://example.com/help",
      },
    });

    expect(
      await screen.findByPlaceholderText("Enter a URL it should go to"),
    ).not.toHaveFocus();
  });
});
