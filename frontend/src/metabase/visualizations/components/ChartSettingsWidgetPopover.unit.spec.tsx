import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ChartSettingsWidgetPopover } from "metabase/visualizations/components/ChartSettingsWidgetPopover";

import type { Widget } from "../types";

import { ChartSettingSelect } from "./settings/ChartSettingSelect";

type PopoverProps = ComponentProps<typeof ChartSettingsWidgetPopover>;

const DEFAULT_PROPS: Pick<PopoverProps, "handleEndShowWidget"> = {
  handleEndShowWidget: jest.fn(),
};

const FORMATTING_WIDGET: Widget = {
  id: "column_settings",
  section: "Formatting",
  widget: function testWidget() {
    return <p>Foo</p>;
  },
  props: {},
};

const STYLE_WIDGET: Widget = {
  id: "series_settings",
  section: "Style",
  widget: function testWidget() {
    return <p>Bar</p>;
  },
  props: {},
};

type SetupProps = Omit<PopoverProps, "anchor" | "handleEndShowWidget">;

const setup = (props: SetupProps) => {
  const Container = () => {
    const [anchor, setAnchor] = useState<HTMLElement>(document.body);

    return (
      <>
        <p
          ref={(element) => {
            if (element) {
              setAnchor(element);
            }
          }}
        >
          Anchor
        </p>
        <ChartSettingsWidgetPopover
          anchor={anchor}
          {...DEFAULT_PROPS}
          {...props}
        />
      </>
    );
  };
  return renderWithProviders(<Container />);
};

it("should display when an anchor is passed", async () => {
  setup({ widgets: [FORMATTING_WIDGET, STYLE_WIDGET] });

  expect(
    await screen.findByText("Formatting", {}, { timeout: 2000 }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Style")).toBeInTheDocument();

  //Should Default to rendering formatting
  expect(await screen.findByText("Foo")).toBeInTheDocument();
});

it("should not show tabs when only 1 widget is passed", async () => {
  setup({ widgets: [FORMATTING_WIDGET] });

  expect(screen.queryByText("Formatting")).not.toBeInTheDocument();
  expect(screen.queryByText("Style")).not.toBeInTheDocument();

  //Should Default to rendering formatting
  expect(
    await screen.findByText("Foo", {}, { timeout: 2000 }),
  ).toBeInTheDocument();
});

it("should change tabs when clicked", async () => {
  setup({ widgets: [FORMATTING_WIDGET, STYLE_WIDGET] });

  //Should Default to rendering formatting
  expect(
    await screen.findByText("Foo", {}, { timeout: 2000 }),
  ).toBeInTheDocument();

  await userEvent.click(await screen.findByText("Style"));

  expect(await screen.findByText("Bar")).toBeInTheDocument();
});

describe("Select widgets", () => {
  const onChange = jest.fn();

  const SELECT_WIDGET: Widget = {
    id: "column_settings",
    section: "Formatting",
    widget: () => (
      <ChartSettingSelect
        options={[
          { name: "Option 1", value: "value1" },
          { name: "Option 2", value: "value2" },
        ]}
        value="value1"
        onChange={onChange}
      />
    ),
    props: {},
  };

  beforeEach(() => {
    onChange.mockClear();
  });

  it("should render the dropdown outside of the popover's scroll container", async () => {
    setup({ widgets: [SELECT_WIDGET] });

    await userEvent.click(await screen.findByTestId("chart-setting-select"));

    const scrollContainer = screen.getByTestId(
      "chart-settings-widget-popover-content",
    );
    const option = await screen.findByText("Option 2");

    expect(scrollContainer).not.toContainElement(option);
  });

  it("should keep the popover open when an option is selected", async () => {
    setup({ widgets: [SELECT_WIDGET] });

    await userEvent.click(await screen.findByTestId("chart-setting-select"));
    await userEvent.click(await screen.findByText("Option 2"));

    expect(onChange).toHaveBeenCalledWith("value2");
    // The popover content (and its select) remains mounted.
    expect(
      within(
        screen.getByTestId("chart-settings-widget-popover-content"),
      ).getByTestId("chart-setting-select"),
    ).toBeInTheDocument();
  });

  it("should close the dropdown when the popover scrolls", async () => {
    // The dropdown floats past the popover, so it must not linger detached when
    // the popover scrolls.

    setup({ widgets: [SELECT_WIDGET] });

    await userEvent.click(await screen.findByTestId("chart-setting-select"));
    expect(await screen.findByText("Option 2")).toBeInTheDocument();

    fireEvent.scroll(
      screen.getByTestId("chart-settings-widget-popover-content"),
    );

    await waitFor(() =>
      expect(screen.queryByText("Option 2")).not.toBeInTheDocument(),
    );
    // The popover itself stays open.
    expect(
      screen.getByTestId("chart-settings-widget-popover-content"),
    ).toBeInTheDocument();
  });
});
