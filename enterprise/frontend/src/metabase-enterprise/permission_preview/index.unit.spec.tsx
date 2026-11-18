import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_PERMISSION_PREVIEW, reinitialize } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { initializePlugin } from "./index";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

describe("permission preview initializePlugin", () => {
  beforeAll(() => {
    jest
      .mocked(hasPremiumFeature)
      .mockImplementation((feature) => feature === "advanced_permissions");
    initializePlugin();
  });

  afterAll(() => {
    reinitialize();
  });

  it("puts no View app as… button on the Permissions toolbar", () => {
    const { PermissionsToolbarButtons } = PLUGIN_PERMISSION_PREVIEW;

    renderWithProviders(
      <>{PermissionsToolbarButtons && <PermissionsToolbarButtons />}</>,
    );

    expect(
      screen.queryByRole("button", { name: /View app as/ }),
    ).not.toBeInTheDocument();
  });

  it("guard: keeps the Preview access tab", () => {
    expect(PLUGIN_PERMISSION_PREVIEW.tabs).toEqual([
      { name: "Preview access", value: "troubleshoot" },
    ]);
  });

  it("guard: keeps View as… on dashboards and questions", () => {
    expect(PLUGIN_PERMISSION_PREVIEW.ViewAsButton).not.toBeNull();
  });
});
