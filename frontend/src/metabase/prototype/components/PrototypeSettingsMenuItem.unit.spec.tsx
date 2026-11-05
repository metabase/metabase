import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { Menu } from "metabase/ui";

import type {
  BooleanPrototypeSetting,
  PrototypeSetting,
  SegmentedPrototypeSetting,
  SelectPrototypeSetting,
} from "../types";
import { usePrototypeSetting } from "../use-prototype-setting";

import { PrototypeSettingsMenuItem } from "./PrototypeSettingsMenuItem";

const SHOW_HINTS: BooleanPrototypeSetting = {
  type: "boolean",
  key: "show-hints",
  label: "Show hints",
  defaultValue: false,
};

const FILTER_LAYOUT: SelectPrototypeSetting = {
  type: "select",
  key: "filter-layout",
  label: "Filter layout",
  options: [
    { value: "compact", label: "Compact" },
    { value: "wide", label: "Wide" },
  ],
  defaultValue: "compact",
};

const PREVIEW_MODE: SegmentedPrototypeSetting = {
  type: "segmented",
  key: "preview-mode",
  label: "Preview mode",
  options: [
    { value: "off", label: "Off" },
    { value: "popover", label: "Popover" },
    { value: "chart", label: "Chart" },
  ],
  defaultValue: "popover",
};

function SettingValues() {
  const [showHints] = usePrototypeSetting(SHOW_HINTS);
  const [filterLayout] = usePrototypeSetting(FILTER_LAYOUT);
  return (
    <div data-testid="setting-values">{`${showHints}:${filterLayout}`}</div>
  );
}

interface SetupOpts {
  settings: readonly PrototypeSetting[];
}

const setup = ({ settings }: SetupOpts) => {
  return renderWithProviders(
    <>
      <Menu opened>
        <Menu.Target>
          <button>{"Menu"}</button>
        </Menu.Target>
        <Menu.Dropdown>
          <PrototypeSettingsMenuItem settings={settings} />
        </Menu.Dropdown>
      </Menu>
      <SettingValues />
    </>,
  );
};

const openSubmenu = async () => {
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Prototype settings" }),
  );
  return screen.findByTestId("prototype-settings-submenu");
};

describe("PrototypeSettingsMenuItem", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should show an empty state when the prototype has no settings", async () => {
    setup({ settings: [] });

    const submenu = await openSubmenu();

    expect(
      within(submenu).getByText("No settings for this prototype."),
    ).toBeInTheDocument();
  });

  it("should show a control for each setting with its default value", async () => {
    setup({ settings: [SHOW_HINTS, FILTER_LAYOUT] });

    const submenu = await openSubmenu();

    expect(within(submenu).getByLabelText("Show hints")).not.toBeChecked();
    expect(
      within(submenu).getByRole("textbox", { name: "Filter layout" }),
    ).toHaveValue("Compact");
    expect(
      within(submenu).queryByText("No settings for this prototype."),
    ).not.toBeInTheDocument();
  });

  it("should give new values to every component that reads the setting", async () => {
    setup({ settings: [SHOW_HINTS, FILTER_LAYOUT] });
    expect(screen.getByTestId("setting-values")).toHaveTextContent(
      "false:compact",
    );

    const submenu = await openSubmenu();
    await userEvent.click(within(submenu).getByLabelText("Show hints"));
    await userEvent.click(
      within(submenu).getByRole("textbox", { name: "Filter layout" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Wide" }));

    expect(within(submenu).getByLabelText("Show hints")).toBeChecked();
    expect(screen.getByTestId("setting-values")).toHaveTextContent("true:wide");
  });

  it("should show a segmented setting with all its options and change it", async () => {
    setup({ settings: [PREVIEW_MODE] });

    const submenu = await openSubmenu();
    expect(within(submenu).getByLabelText("Popover")).toBeChecked();

    await userEvent.click(within(submenu).getByText("Chart"));

    expect(within(submenu).getByLabelText("Chart")).toBeChecked();
    expect(
      localStorage.getItem("metabase-prototype-setting:preview-mode"),
    ).toBe(JSON.stringify("chart"));
  });

  it("should keep the values after the app is rendered again", async () => {
    const { unmount } = setup({ settings: [SHOW_HINTS] });
    const submenu = await openSubmenu();
    await userEvent.click(within(submenu).getByLabelText("Show hints"));
    unmount();

    setup({ settings: [SHOW_HINTS] });

    expect(screen.getByTestId("setting-values")).toHaveTextContent(
      "true:compact",
    );
  });

  it("should use the default value when the stored value is not valid", () => {
    localStorage.setItem(
      "metabase-prototype-setting:filter-layout",
      JSON.stringify("removed-option"),
    );
    localStorage.setItem("metabase-prototype-setting:show-hints", "not json");

    setup({ settings: [SHOW_HINTS, FILTER_LAYOUT] });

    expect(screen.getByTestId("setting-values")).toHaveTextContent(
      "false:compact",
    );
  });
});
