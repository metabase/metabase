import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import type { Widget } from "metabase/visualizations/components/ChartSettings/types";
import { ChartSettingsWidgetPopover } from "metabase/visualizations/components/ChartSettingsWidgetPopover";

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
