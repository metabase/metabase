import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import ChartSettingsWidgetPopover from "metabase/visualizations/components/ChartSettingsWidgetPopover";

const DEFAULT_PROPS = {
  handleEndShowWidget: jest.fn(),
};

const FORMATTING_WIDGET = {
  id: "column_settings",
  section: "Formatting",
  widget: function testWidget() {
    return <p>Foo</p>;
  },
  onChange: () => {},
};

const STYLE_WIDGET = {
  id: "series_settings",
  section: "Style",
  widget: function testWidget() {
    return <p>Bar</p>;
  },
  onChange: () => {},
};

const setup = props => {
  const Container = () => {
    const [anchor, setAnchor] = useState();

    return (
      <>
        <p ref={setAnchor}>Anchor</p>
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

  expect(await screen.findByText("Formatting")).toBeInTheDocument();
  expect(await screen.findByText("Style")).toBeInTheDocument();

  //Should Default to rendering formatting
  expect(await screen.findByText("Foo")).toBeInTheDocument();
});

it("should not show tabs when only 1 widget is passed", async () => {
  setup({ widgets: [FORMATTING_WIDGET] });

  expect(screen.queryByText("Formatting")).not.toBeInTheDocument();
  expect(screen.queryByText("Style")).not.toBeInTheDocument();

  //Should Default to rendering formatting
  expect(await screen.findByText("Foo")).toBeInTheDocument();
});

it("should change tabs when clicked", async () => {
  setup({ widgets: [FORMATTING_WIDGET, STYLE_WIDGET] });

  //Should Default to rendering formatting
  expect(await screen.findByText("Foo")).toBeInTheDocument();

  await userEvent.click(await screen.findByText("Style"));

  expect(await screen.findByText("Bar")).toBeInTheDocument();
});
