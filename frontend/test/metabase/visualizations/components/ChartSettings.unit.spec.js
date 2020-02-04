import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, fireEvent, cleanup } from "@testing-library/react";

import ChartSettings from "metabase/visualizations/components/ChartSettings";

const DEFAULT_PROPS = {
  series: [
    { card: { visualization_settings: {} }, data: { rows: [], cols: [] } },
  ],
  settings: {},
};

function widget(widget = {}) {
  return {
    id: "id-" + Math.random(),
    title: "title-" + Math.random(),
    widget: () => null,
    ...widget,
  };
}

function expectTabSelected(node, value) {
  expect(node.parentNode.getAttribute("aria-selected")).toBe(String(value));
}

describe("ChartSettings", () => {
  afterEach(cleanup);

  it("should not crash if there are no widgets", () => {
    render(<ChartSettings {...DEFAULT_PROPS} widgets={[]} />);
  });
  it("should not crash if the initial section is invalid", () => {
    render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[widget({ section: "Foo" })]}
        initial={{ section: "Bar" }}
      />,
    );
  });
  it("should default to the first section (if no section in DEFAULT_TAB_PRIORITY)", () => {
    const { getByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[widget({ section: "Foo" }), widget({ section: "Bar" })]}
      />,
    );
    expectTabSelected(getByText("Foo"), true);
    expectTabSelected(getByText("Bar"), false);
  });
  it("should default to the DEFAULT_TAB_PRIORITY", () => {
    const { getByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[
          widget({ section: "Foo" }),
          widget({ section: "Display" }), // Display is in DEFAULT_TAB_PRIORITY
        ]}
      />,
    );
    expectTabSelected(getByText("Foo"), false);
    expectTabSelected(getByText("Display"), true);
  });
  it("should be able to switch sections", () => {
    const { getByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[widget({ section: "Foo" }), widget({ section: "Bar" })]}
      />,
    );
    expectTabSelected(getByText("Foo"), true);
    expectTabSelected(getByText("Bar"), false);
    fireEvent.click(getByText("Bar"));
    expectTabSelected(getByText("Foo"), false);
    expectTabSelected(getByText("Bar"), true);
  });

  it("should show widget names", () => {
    const { getByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[
          widget({ title: "Widget1", section: "Foo" }),
          widget({ title: "Widget2", section: "Foo" }),
        ]}
      />,
    );
    expect(getByText("Widget1", { exact: false })).toBeInTheDocument();
    expect(getByText("Widget2", { exact: false })).toBeInTheDocument();
  });

  it("should not show hidden widgets", () => {
    const { getByText, queryByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[
          widget({ title: "Widget1", section: "Foo" }),
          widget({ title: "Widget2", section: "Foo", hidden: true }),
        ]}
      />,
    );
    expect(getByText("Widget1", { exact: false })).toBeInTheDocument();
    expect(queryByText("Widget2", { exact: false })).toBe(null);
  });

  it("should show the section picker if there are multiple sections", () => {
    const { getByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[
          widget({ title: "Widget1", section: "Foo" }),
          widget({ title: "Widget2", section: "Bar" }),
        ]}
      />,
    );
    expect(getByText("Foo")).toBeInTheDocument();
  });

  it("should not show the section picker if there's only one section", () => {
    const { queryByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[
          widget({ title: "Something", section: "Foo" }),
          widget({ title: "Other Thing", section: "Foo" }),
        ]}
      />,
    );
    expect(queryByText("Foo")).toBe(null);
  });

  it("should not show the section picker if showing a column setting", () => {
    const columnSettingsWidget = widget({
      title: "Something",
      section: "Formatting",
      hidden: true,
      id: "column_settings",
    });
    const { queryByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[
          widget({ title: "List of columns", section: "Foo", id: "thing" }),
          widget({ title: "Other Thing", section: "Bar", id: "other_thing" }),
          columnSettingsWidget,
        ]}
        initial={{ widget: columnSettingsWidget }}
      />,
    );
    expect(queryByText("Foo")).toBe(null);
  });
});
