import { renderWithProviders, screen } from "__support__/ui";
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

    expect(screen.getByText("Display as")).toBeInTheDocument();
  });
});

describe("ColumnSettings read-only", () => {
  type SetupOpts = {
    value?: ApiColumnSettings;
    readOnly?: boolean;
  };

  const setup = ({ value = {}, readOnly }: SetupOpts = {}) => {
    renderWithProviders(
      <ColumnSettings
        column={createMockField({
          base_type: "type/Integer",
          effective_type: "type/Integer",
        })}
        value={value}
        readOnly={readOnly}
      />,
    );
  };

  it("shows the formatting of a read-only column without letting it change", () => {
    setup({ readOnly: true });

    expect(screen.getByTestId("prefix")).toHaveAttribute("readonly");
    expect(screen.getByTestId("suffix")).toHaveAttribute("readonly");
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("disables the radio settings of a read-only column", () => {
    setup({ value: { number_style: "currency" }, readOnly: true });

    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(0);
    radios.forEach((radio) => expect(radio).toBeDisabled());
  });

  it("keeps the formatting of a column editable by default", () => {
    setup({ value: { number_style: "currency" } });

    expect(screen.getByTestId("prefix")).not.toHaveAttribute("readonly");
    expect(screen.getByRole("switch")).toBeEnabled();
    screen
      .getAllByRole("radio")
      .forEach((radio) => expect(radio).toBeEnabled());
  });
});
