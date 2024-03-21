import { render, screen } from "__support__/ui";

import { SettingsSetting } from "./SettingsSetting";

const SETTING = {
  key: "site-name",
  display_name: "Site Name",
  type: "string",
};

const setup = () => {
  render(<SettingsSetting setting={SETTING} />);
};

describe("SettingsSetting", () => {
  it("renders a setting", () => {
    setup();
    expect(screen.getByText("Site Name")).toBeInTheDocument();
  });

  it("highlights itself if it's key is in location.hash", () => {
    const ogScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    window.location.hash = "#site-name";
    const mockScroll = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = mockScroll;

    setup();

    expect(screen.getByTestId("site-name-setting")).toHaveStyle(
      "box-shadow: 0 0 0 1px #509EE3",
    );

    expect(mockScroll).toHaveBeenCalled();

    window.location.hash = "";
    window.HTMLElement.prototype.scrollIntoView = ogScrollIntoView;
  });
});
