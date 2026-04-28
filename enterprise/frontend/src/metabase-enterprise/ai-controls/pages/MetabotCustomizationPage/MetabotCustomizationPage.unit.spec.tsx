import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
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
  setupPropertiesEndpoints(
    createMockSettings({
      "metabot-name": metabotName,
      "metabot-icon": metabotIcon,
      "metabot-show-illustrations": showIllustrations,
    }),
  );
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(<MetabotCustomizationPage />);
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
    expect(screen.queryByText("Metabot illustrations")).not.toBeInTheDocument();
  });

  it("shows the remove button and illustrations toggle when a custom icon is set", async () => {
    setup({ metabotIcon: "data:image/png;base64,abc123" });

    await screen.findByText("AI agent's icon");
    expect(
      screen.getByRole("button", { name: /Remove custom icon/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Metabot illustrations")).toBeInTheDocument();
  });

  it("shows the custom icon preview image when a custom icon is set", async () => {
    setup({ metabotIcon: "data:image/png;base64,abc123" });

    const preview = await screen.findByAltText("Metabot icon");
    expect(preview).toHaveAttribute("src", "data:image/png;base64,abc123");
  });
});
