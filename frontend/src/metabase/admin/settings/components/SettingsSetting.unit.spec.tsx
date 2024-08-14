import { renderWithProviders, screen } from "__support__/ui";

import { SettingsSetting } from "./SettingsSetting";

const SETTING = {
  key: "site-name",
  display_name: "Site Name",
  type: "string",
};

const setup = () => {
  renderWithProviders(<SettingsSetting setting={SETTING} />);
};

describe("SettingsSetting", () => {
  it("renders a setting", () => {
    setup();
    expect(screen.getByText("Site Name")).toBeInTheDocument();
  });

  it("highlights itself if it's key is in location.hash", () => {
    window.location.hash = "#site-name";

    setup();

    expect(screen.getByTestId("site-name-setting")).toHaveStyle(
      "box-shadow: 0 0 0 1px var(--mb-color-brand)",
    );
    window.location.hash = "";
  });
});
