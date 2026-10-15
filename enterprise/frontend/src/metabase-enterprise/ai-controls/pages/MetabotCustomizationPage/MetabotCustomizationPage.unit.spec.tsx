import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { MetabotCustomizationPage } from "./MetabotCustomizationPage";

function setup({
  metabotName = "Metabot",
  metabotIcon = "metabot",
  showIllustrations = true,
}: {
  metabotName?: string;
  metabotIcon?: string | null;
  showIllustrations?: boolean;
} = {}) {
  const settings = createMockSettings({
    "metabot-name": metabotName,
    "metabot-icon": metabotIcon,
    "metabot-show-illustrations": showIllustrations,
  });

  setupStatefulSettingsEndpoints(settings);
  setupSettingsEndpoints([]);

  // Seed the store state too: without it, the render harness seeds the
  // settings bootstrap with *defaults*, and assertions can run against the
  // bootstrap-rendered UI before the mocked properties fetch resolves.
  renderWithProviders(<MetabotCustomizationPage />, {
    storeInitialState: { settings: mockSettings(settings) },
  });
}

describe("MetabotCustomizationPage", () => {
  it("renders the name input with the current metabot name", async () => {
    setup({ metabotName: "My AI Assistant" });

    const nameInput = await screen.findByDisplayValue("My AI Assistant");
    expect(nameInput).toBeInTheDocument();
  });

  it("shows default icon state when no custom icon is set", async () => {
    setup({ metabotIcon: "metabot" });

    await screen.findByText("AI agent's icon");
    expect(
      screen.queryByRole("button", { name: /Remove custom icon/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Show Metabot illustrations/ }),
    ).toBeChecked();
  });

  it("shows the remove button and illustrations toggle when a custom icon is set", async () => {
    setup({ metabotIcon: "data:image/png;base64,abc123" });

    await screen.findByText("AI agent's icon");
    expect(
      screen.getByRole("button", { name: /Remove custom icon/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Metabot illustrations")).toBeInTheDocument();
    expect(
      screen.getByAltText("Metabot illustration preview"),
    ).toBeInTheDocument();
  });

  it("shows the custom icon preview image when a custom icon is set", async () => {
    setup({ metabotIcon: "data:image/png;base64,abc123" });

    const preview = await screen.findByAltText("Metabot icon");
    expect(preview).toHaveAttribute("src", "data:image/png;base64,abc123");
  });

  it("keeps the illustrations toggle after turning illustrations on with the default icon", async () => {
    setup({ showIllustrations: false });

    const toggle = await screen.findByRole("switch", {
      name: /Show Metabot illustrations/,
    });
    await userEvent.click(toggle);

    const call = fetchMock.callHistory.lastCall(
      "path:/api/setting/metabot-show-illustrations",
      { method: "PUT" },
    );
    expect(await call?.request?.json()).toEqual({ value: true });
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /Show Metabot illustrations/ }),
      ).toBeChecked(),
    );
  });
});
