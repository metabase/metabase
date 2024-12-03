import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import type { Widget } from "../types";

import { BaseChartSettings } from "./BaseChartSettings";
import type { BaseChartSettingsProps } from "./types";

registerVisualizations();

const DEFAULT_PROPS = {
  widgets: [],
  series: [
    {
      card: createMockCard({ visualization_settings: {} }),
      ...createMockDataset({ data: { rows: [], cols: [] } }),
    },
  ],
  settings: {},
};

function widget(widget: Partial<Widget> = {}): Widget {
  return {
    id: "id-" + Math.random(),
    title: "title-" + Math.random(),
    widget: () => null,
    section: "section-" + Math.random(),
    props: {},
    ...widget,
  } as Widget;
}

type SetupOpts = Partial<BaseChartSettingsProps>;

const setup = (props: SetupOpts) => {
  return renderWithProviders(
    <BaseChartSettings {...DEFAULT_PROPS} {...props} />,
  );
};

describe("ChartSettings", () => {
  it("should not crash if there are no widgets", () => {
    expect(() => setup({ widgets: [] })).not.toThrow();
  });

  it("should not crash if the initial section is invalid", () => {
    expect(() =>
      setup({
        widgets: [widget({ section: "Foo" })],
        initial: { section: "Bar" },
      }),
    ).not.toThrow();
  });

  it("should default to the first section (if no section in DEFAULT_TAB_PRIORITY)", () => {
    setup({
      widgets: [widget({ section: "Foo" }), widget({ section: "Bar" })],
    });
    expect(screen.getByLabelText("Foo")).toBeChecked();
    expect(screen.getByLabelText("Bar")).not.toBeChecked();
  });

  it("should default to the DEFAULT_TAB_PRIORITY", () => {
    setup({
      widgets: [
        widget({ section: "Foo" }),
        widget({ section: "Display" }), // Display is in DEFAULT_TAB_PRIORITY
      ],
    });

    expect(screen.getByLabelText("Foo")).not.toBeChecked();
    expect(screen.getByLabelText("Display")).toBeChecked();
  });

  it("should be able to switch sections", () => {
    setup({
      widgets: [widget({ section: "Foo" }), widget({ section: "Bar" })],
    });

    expect(screen.getByLabelText("Foo")).toBeChecked();
    expect(screen.getByLabelText("Bar")).not.toBeChecked();
    fireEvent.click(screen.getByText("Bar"));
    expect(screen.getByLabelText("Foo")).not.toBeChecked();
    expect(screen.getByLabelText("Bar")).toBeChecked();
  });

  it("should show widget names", () => {
    setup({
      widgets: [
        widget({ title: "Widget1", section: "Foo" }),
        widget({ title: "Widget2", section: "Foo" }),
      ],
    });

    expect(screen.getByText("Widget1", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Widget2", { exact: false })).toBeInTheDocument();
  });

  it("should not show hidden widgets", () => {
    setup({
      widgets: [
        widget({ title: "Widget1", section: "Foo" }),
        widget({ title: "Widget2", section: "Foo", hidden: true }),
      ],
    });

    expect(screen.getByText("Widget1", { exact: false })).toBeInTheDocument();
    expect(
      screen.queryByText("Widget2", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("should show the section picker if there are multiple sections", () => {
    setup({
      widgets: [
        widget({ title: "Widget1", section: "Foo" }),
        widget({ title: "Widget2", section: "Bar" }),
      ],
    });

    expect(screen.getByText("Foo")).toBeInTheDocument();
  });

  it("should not show the section picker if there's only one section", () => {
    setup({
      widgets: [
        widget({ title: "Something", section: "Foo" }),
        widget({ title: "Other Thing", section: "Foo" }),
      ],
    });

    expect(screen.queryByText("Foo")).not.toBeInTheDocument();
  });
});
