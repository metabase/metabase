import React from "react";
import { renderWithProviders, fireEvent } from "__support__/ui";

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

const setup = props => {
  return renderWithProviders(<ChartSettings {...DEFAULT_PROPS} {...props} />, {
    withSettings: true,
    withEmbedSettings: true,
  });
};

describe("ChartSettings", () => {
  it("should not crash if there are no widgets", () => {
    setup({
      widgets: [],
    });
  });
  it("should not crash if the initial section is invalid", () => {
    setup({
      widgets: [widget({ section: "Foo" })],
      initial: { section: "Bar" },
    });
  });
  it("should default to the first section (if no section in DEFAULT_TAB_PRIORITY)", () => {
    const { getByLabelText } = setup({
      widgets: [widget({ section: "Foo" }), widget({ section: "Bar" })],
    });
    expect(getByLabelText("Foo")).toBeChecked();
    expect(getByLabelText("Bar")).not.toBeChecked();
  });
  it("should default to the DEFAULT_TAB_PRIORITY", () => {
    const { getByLabelText } = setup({
      widgets: [
        widget({ section: "Foo" }),
        widget({ section: "Display" }), // Display is in DEFAULT_TAB_PRIORITY
      ],
    });

    expect(getByLabelText("Foo")).not.toBeChecked();
    expect(getByLabelText("Display")).toBeChecked();
  });
  it("should be able to switch sections", () => {
    const { getByText, getByLabelText } = setup({
      widgets: [widget({ section: "Foo" }), widget({ section: "Bar" })],
    });

    expect(getByLabelText("Foo")).toBeChecked();
    expect(getByLabelText("Bar")).not.toBeChecked();
    fireEvent.click(getByText("Bar"));
    expect(getByLabelText("Foo")).not.toBeChecked();
    expect(getByLabelText("Bar")).toBeChecked();
  });

  it("should show widget names", () => {
    const { getByText } = setup({
      widgets: [
        widget({ title: "Widget1", section: "Foo" }),
        widget({ title: "Widget2", section: "Foo" }),
      ],
    });

    expect(getByText("Widget1", { exact: false })).toBeInTheDocument();
    expect(getByText("Widget2", { exact: false })).toBeInTheDocument();
  });

  it("should not show hidden widgets", () => {
    const { getByText, queryByText } = setup({
      widgets: [
        widget({ title: "Widget1", section: "Foo" }),
        widget({ title: "Widget2", section: "Foo", hidden: true }),
      ],
    });

    expect(getByText("Widget1", { exact: false })).toBeInTheDocument();
    expect(queryByText("Widget2", { exact: false })).toBe(null);
  });

  it("should show the section picker if there are multiple sections", () => {
    const { getByText } = setup({
      widgets: [
        widget({ title: "Widget1", section: "Foo" }),
        widget({ title: "Widget2", section: "Bar" }),
      ],
    });

    expect(getByText("Foo")).toBeInTheDocument();
  });

  it("should not show the section picker if there's only one section", () => {
    const { queryByText } = setup({
      widgets: [
        widget({ title: "Something", section: "Foo" }),
        widget({ title: "Other Thing", section: "Foo" }),
      ],
    });

    expect(queryByText("Foo")).toBe(null);
  });
});
