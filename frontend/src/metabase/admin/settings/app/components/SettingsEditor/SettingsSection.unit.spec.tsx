import scrollIntoView from "scroll-into-view-if-needed";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { SettingsSection } from "./SettingsSection";

jest.mock("scroll-into-view-if-needed");

const setup = () => {
  renderWithProviders(
    <SettingsSection
      settingElements={[
        createMockSettingDefinition({
          key: "subscription-allowed-domains",
          display_name: "Subscription Allowed Domains",
          type: "string",
        }),
        createMockSettingDefinition({
          key: "email-configured?",
          display_name: "Email Configured?",
          type: "string",
        }),
      ]}
      settingValues={createMockSettings({
        "subscription-allowed-domains": "somedomain.com",
        "email-configured?": true,
      })}
      derivedSettingValues={createMockSettings({})}
      updateSetting={() => {}}
      reloadSettings={() => {}}
    />,
  );
};

describe("SettingsSection", () => {
  afterEach(() => {
    window.location.hash = "";
    jest.resetAllMocks();
  });

  it("renders settings", () => {
    setup();
    expect(
      screen.getByText("Subscription Allowed Domains"),
    ).toBeInTheDocument();

    expect(screen.getByText("Email Configured?")).toBeInTheDocument();
  });

  it("highlights, autofocus and scrolls into view the proper setting if the hash says so", () => {
    window.location.hash = "#email-configured?";

    setup();

    const renderedSetting = screen.getByTestId("email-configured?-setting");

    expect(renderedSetting).toHaveStyle(
      "box-shadow: 0 0 0 1px var(--mb-color-brand)",
    );

    expect(renderedSetting.querySelector("input")).toHaveFocus();

    expect(scrollIntoView).toHaveBeenCalledWith(renderedSetting, {
      behavior: "smooth",
      block: "center",
      scrollMode: "if-needed",
    });
  });

  it("highlights the first setting if there is no hash in the URL", () => {
    setup();

    const renderedSetting = screen.getByTestId(
      "subscription-allowed-domains-setting",
    );

    // no border for you, there's no hash
    expect(renderedSetting).not.toHaveStyle(
      "box-shadow: 0 0 0 1px var(--mb-color-brand)",
    );

    expect(renderedSetting.querySelector("input")).toHaveFocus();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
