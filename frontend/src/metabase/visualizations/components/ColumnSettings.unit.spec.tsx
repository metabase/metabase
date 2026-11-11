import userEvent from "@testing-library/user-event";

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
  it("shows currency position only when labels appear in every table cell", async () => {
    const column = createMockField({
      base_type: "type/Integer",
      effective_type: "type/Integer",
    });
    const value: ApiColumnSettings = {
      number_style: "currency",
      currency_in_header: true,
      currency_position: "after",
    };
    const onChange = jest.fn();
    const { rerender } = renderWithProviders(
      <ColumnSettings
        column={column}
        value={value}
        onChange={onChange}
        extraData={{ forAdminSettings: true }}
      />,
    );
    expect(screen.queryByText("Currency label position")).not.toBeVisible();

    await userEvent.click(
      screen.getByRole("radio", { name: "In every table cell" }),
    );
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      currency_in_header: false,
    });
    rerender(
      <ColumnSettings
        column={column}
        value={{ ...value, currency_in_header: false }}
        onChange={onChange}
        extraData={{ forAdminSettings: true }}
      />,
    );
    expect(screen.getByText("Currency label position")).toBeVisible();
    expect(screen.getByRole("radio", { name: "After amount" })).toBeChecked();
  });

  it("should allow a column to override the inherited currency position", async () => {
    const onChange = jest.fn();
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Integer",
          effective_type: "type/Integer",
        })}
        inheritedSettings={{ currency_position: "after" }}
        value={{ number_style: "currency" }}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("radio", { name: "After amount" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Before amount" }));
    expect(onChange).toHaveBeenCalledWith({
      number_style: "currency",
      currency_position: "before",
    });
  });

  it("should require names after the amount without changing the saved position", async () => {
    const column = createMockField({
      base_type: "type/Integer",
      effective_type: "type/Integer",
    });
    const onChange = jest.fn();
    const value: ApiColumnSettings = {
      number_style: "currency",
      currency_position: "before",
      currency_style: "name",
    };
    const { rerender } = renderWithProviders(
      <ColumnSettings column={column} value={value} onChange={onChange} />,
    );

    expect(screen.getByRole("radio", { name: "After amount" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "After amount" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Before amount" })).toBeDisabled();
    expect(
      screen.getByText("Currency names always appear after the amount."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Symbol/ }));
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      currency_style: "symbol",
    });
    rerender(
      <ColumnSettings
        column={column}
        value={{ ...value, currency_style: "symbol" }}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("radio", { name: "Before amount" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Before amount" })).toBeEnabled();
    expect(
      screen.queryByText("Currency names always appear after the amount."),
    ).not.toBeInTheDocument();
  });

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

  it("shows the currency example with the label after the amount when the column puts it there", () => {
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Integer",
          effective_type: "type/Integer",
        })}
        value={{ number_style: "currency", currency_position: "after" }}
      />,
    );

    const format = within(
      screen.getByTestId("chart-settings-widget-number_style"),
    );
    expect(format.getByRole("radio", { name: "1.23\u00a0$" })).toBeChecked();
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
