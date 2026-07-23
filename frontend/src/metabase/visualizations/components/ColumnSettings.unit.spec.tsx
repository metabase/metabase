import { renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
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

  // proves the FormattingColumn union: a Field flows through the same pipeline
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
});
