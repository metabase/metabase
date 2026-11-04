import { renderWithProviders, screen, within } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { ColumnSettings as ApiColumnSettings } from "metabase-types/api";
import {
  createMockDatetimeColumn,
  createMockField,
} from "metabase-types/api/mocks";

import { ColumnSettings, hasColumnSettingsWidgets } from "./ColumnSettings";

registerVisualizations();

describe("hasColumnSettingsWidgets", () => {
  it("returns true for a date DatasetColumn", () => {
    expect(
      hasColumnSettingsWidgets({ column: createMockDatetimeColumn() }),
    ).toBe(true);
  });

  describe("prove a raw Field flows through the same pipeline as a DatasetColumn", () => {
    it("returns true for a number Field", () => {
      expect(
        hasColumnSettingsWidgets({
          column: createMockField({
            base_type: "type/Integer",
            effective_type: "type/Integer",
          }),
        }),
      ).toBe(true);
    });
  });
});

describe("ColumnSettings", () => {
  it("renders formatting widgets for a number Field", () => {
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Integer",
          effective_type: "type/Integer",
        })}
        value={{}}
      />,
    );

    expect(screen.getByTestId("column-settings")).toBeInTheDocument();
    expect(
      screen.queryByText("No formatting settings"),
    ).not.toBeInTheDocument();
  });

  it("includes the default visualization's column settings for a number Field", () => {
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Integer",
          effective_type: "type/Integer",
        })}
        value={{}}
      />,
    );

    expect(screen.getByText("Show a mini bar chart")).toBeInTheDocument();
  });

  it("includes the default visualization's column settings for a string Field", () => {
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Text",
          effective_type: "type/Text",
          semantic_type: null,
        })}
        value={{}}
      />,
    );

    expect(
      screen.getByText("Display as text, link, or image"),
    ).toBeInTheDocument();
  });

  it("puts the number format first and Display as last for a number Field", () => {
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Integer",
          effective_type: "type/Integer",
          semantic_type: null,
        })}
        value={{}}
      />,
    );

    const settingIds = screen
      .getAllByTestId(/^chart-settings-widget-/)
      .map((widget) =>
        widget
          .getAttribute("data-testid")
          ?.replace("chart-settings-widget-", ""),
      );
    expect(settingIds.slice(0, 5)).toEqual([
      "column_title",
      "show_mini_bar",
      "text_align",
      "number_style",
      "currency",
    ]);
    expect(settingIds.slice(-3)).toEqual(["view_as", "link_text", "link_url"]);
  });

  it("shows each number format as an example in the column's separators and currency", () => {
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Integer",
          effective_type: "type/Integer",
        })}
        value={{ number_separators: ",.", currency: "EUR" }}
      />,
    );

    const format = within(
      screen.getByTestId("chart-settings-widget-number_style"),
    );
    expect(
      format.getAllByRole("radio").map((radio) => radio.getAttribute("value")),
    ).toEqual(["decimal", "percent", "currency", "scientific"]);
    ["1,23", "123%", "€1,23", "1,23e+0"].forEach((name) =>
      expect(format.getByRole("radio", { name })).toBeInTheDocument(),
    );
  });
});

describe("ColumnSettings disabled", () => {
  type SetupOpts = {
    value?: ApiColumnSettings;
    disabled?: boolean;
  };

  const setup = ({ value = {}, disabled }: SetupOpts = {}) => {
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Integer",
          effective_type: "type/Integer",
        })}
        value={value}
        disabled={disabled}
      />,
    );
  };

  it("shows the formatting of a column without letting it change when disabled", () => {
    setup({ disabled: true });

    expect(screen.getByTestId("prefix")).toBeDisabled();
    expect(screen.getByTestId("suffix")).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByLabelText("Number of decimal places")).toBeDisabled();
  });

  it("disables the radio settings of a disabled column", () => {
    setup({ value: { number_style: "currency" }, disabled: true });

    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(0);
    radios.forEach((radio) => expect(radio).toBeDisabled());
  });

  it("keeps the formatting of a column editable by default", () => {
    setup({ value: { number_style: "currency" } });

    expect(screen.getByTestId("prefix")).toBeEnabled();
    expect(screen.getByRole("switch")).toBeEnabled();
    expect(screen.getByLabelText("Number of decimal places")).toBeEnabled();
    screen
      .getAllByRole("radio")
      .forEach((radio) => expect(radio).toBeEnabled());
  });
});
