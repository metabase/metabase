import { addLocale, useLocale } from "ttag";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { Widget } from "metabase/visualizations/types";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

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
  };
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

  it("should put unsectioned widgets into the first section by priority, not insertion order", () => {
    // matches the scalar shape: a non-priority section is registered before a
    // priority section. The unsectioned widget should land in Formatting, not
    // in the first-inserted "Conditional colors".
    setup({
      widgets: [
        widget({ title: "Unsectioned", section: undefined }),
        widget({ title: "InColors", section: "Conditional colors" }),
        widget({ title: "InFormatting", section: "Formatting" }),
      ],
      initial: { section: "Formatting" },
    });

    // Formatting tab is active, so unsectioned + Formatting widget should be visible
    expect(
      screen.getByText("Unsectioned", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("InFormatting", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("InColors", { exact: false }),
    ).not.toBeInTheDocument();

    // switch to Conditional colors and verify the unsectioned widget does not follow
    fireEvent.click(screen.getByText("Conditional colors"));
    expect(
      screen.queryByText("Unsectioned", { exact: false }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("InColors", { exact: false })).toBeInTheDocument();
  });

  describe("with a non-English locale", () => {
    beforeAll(() => {
      addLocale("es-fake", {
        headers: { "plural-forms": "nplurals=2; plural=(n != 1);" },
        translations: {
          "": {
            Data: { msgid: "Data", msgstr: ["Datos"] },
            Columns: { msgid: "Columns", msgstr: ["Columnas"] },
            Display: { msgid: "Display", msgstr: ["Visualización"] },
            Axes: { msgid: "Axes", msgstr: ["Ejes"] },
            Ranges: { msgid: "Ranges", msgstr: ["Rangos"] },
            Formatting: { msgid: "Formatting", msgstr: ["Formato"] },
          },
        },
      });
      useLocale("es-fake");
    });

    afterAll(() => {
      // restore the default locale so later tests aren't affected
      useLocale("en");
    });

    it("should sort translated sections by priority, not by insertion order", () => {
      setup({
        widgets: [
          widget({ title: "InAxes", section: "Ejes" }),
          widget({ title: "InData", section: "Datos" }),
          widget({ title: "InFormatting", section: "Formato" }),
        ],
      });

      // Data is first in the priority order, so its localized label ("Datos") is the active tab
      expect(screen.getByLabelText("Datos")).toBeChecked();
      expect(screen.getByLabelText("Ejes")).not.toBeChecked();
      expect(screen.getByLabelText("Formato")).not.toBeChecked();
    });

    it("should put unsectioned widgets into the highest-priority translated section", () => {
      setup({
        widgets: [
          widget({ title: "Unsectioned", section: undefined }),
          widget({ title: "InColors", section: "Conditional colors" }),
          widget({ title: "InFormatting", section: "Formato" }),
        ],
        initial: { section: "Formato" },
      });

      // unsectioned widget landed in the translated Formato tab, not Conditional colors
      expect(
        screen.getByText("Unsectioned", { exact: false }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("InFormatting", { exact: false }),
      ).toBeInTheDocument();
    });
  });
});
