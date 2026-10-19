import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import type {
  BooleanPrototypeSetting,
  PrototypeSetting,
  SelectPrototypeSetting,
} from "../types";
import { usePrototypeSetting } from "../use-prototype-setting";

import { PrototypeSettingsButton } from "./PrototypeSettingsButton";

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
      <PrototypeSettingsButton settings={settings} />
      <SettingValues />
    </>,
  );
};

describe("PrototypeSettingsButton", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should show an empty state when the prototype has no settings", async () => {
    setup({ settings: [] });

    await userEvent.click(
      screen.getByRole("button", { name: "Prototype settings" }),
    );

    expect(
      await screen.findByText("No settings for this prototype."),
    ).toBeInTheDocument();
  });

  it("should show a control for each setting with its default value", async () => {
    setup({ settings: [SHOW_HINTS, FILTER_LAYOUT] });

    await userEvent.click(
      screen.getByRole("button", { name: "Prototype settings" }),
    );

    expect(await screen.findByLabelText("Show hints")).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "Filter layout" })).toHaveValue(
      "Compact",
    );
    expect(
      screen.queryByText("No settings for this prototype."),
    ).not.toBeInTheDocument();
  });

  it("should give new values to every component that reads the setting", async () => {
    setup({ settings: [SHOW_HINTS, FILTER_LAYOUT] });
    expect(screen.getByTestId("setting-values")).toHaveTextContent(
      "false:compact",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Prototype settings" }),
    );
    await userEvent.click(await screen.findByLabelText("Show hints"));
    await userEvent.click(
      screen.getByRole("textbox", { name: "Filter layout" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Wide" }));

    expect(screen.getByLabelText("Show hints")).toBeChecked();
    expect(screen.getByTestId("setting-values")).toHaveTextContent("true:wide");
  });

  it("should keep the values after the app is rendered again", async () => {
    const { unmount } = setup({ settings: [SHOW_HINTS] });
    await userEvent.click(
      screen.getByRole("button", { name: "Prototype settings" }),
    );
    await userEvent.click(await screen.findByLabelText("Show hints"));
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
