import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import "jest-dom/extend-expect";

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
    expect(getByText("Foo")).toHaveClass("text-brand");
    expect(getByText("Bar")).not.toHaveClass("text-brand");
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
    expect(getByText("Foo")).not.toHaveClass("text-brand");
    expect(getByText("Display")).toHaveClass("text-brand");
  });
  it("should be able to switch sections", () => {
    const { getByText } = render(
      <ChartSettings
        {...DEFAULT_PROPS}
        widgets={[widget({ section: "Foo" }), widget({ section: "Bar" })]}
      />,
    );
    expect(getByText("Foo")).toHaveClass("text-brand");
    expect(getByText("Bar")).not.toHaveClass("text-brand");
    fireEvent.click(getByText("Bar"));
    expect(getByText("Foo")).not.toHaveClass("text-brand");
    expect(getByText("Bar")).toHaveClass("text-brand");
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
});
