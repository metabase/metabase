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
});
