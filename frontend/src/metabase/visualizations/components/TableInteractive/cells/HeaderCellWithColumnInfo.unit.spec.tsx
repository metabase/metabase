import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { DatasetColumn } from "metabase-types/api";

import { HeaderCellWithColumnInfo } from "./HeaderCellWithColumnInfo";

// Minimal mock that avoids needing a real metabase-lib Question.
// When getInfoPopoversDisabled returns true (dashboard mode), the component
// doesn't call question.query(), so we only need a stub.
const mockQuestion = {} as any;

const mockColumn: DatasetColumn = {
  name: "TOTAL",
  display_name: "Total",
  base_type: "type/Float",
  semantic_type: null,
  source: "fields",
  effective_type: "type/Float",
  field_ref: ["field", 1, null],
} as DatasetColumn;

const mockTheme = {} as any;

const defaultProps = {
  name: "Total",
  align: "right" as const,
  sort: undefined,
  variant: "light" as const,
  getInfoPopoversDisabled: () => true,
  question: mockQuestion,
  column: mockColumn,
  columnIndex: 0,
  theme: mockTheme,
};

describe("HeaderCellWithColumnInfo", () => {
  it("should not render a hide button when onHideColumn is not provided", () => {
    renderWithProviders(<HeaderCellWithColumnInfo {...defaultProps} />);

    expect(
      screen.queryByRole("button", { name: "Hide column" }),
    ).not.toBeInTheDocument();
  });

  it("should render a hide button when onHideColumn is provided", () => {
    const onHideColumn = jest.fn();
    renderWithProviders(
      <HeaderCellWithColumnInfo
        {...defaultProps}
        onHideColumn={onHideColumn}
        columnId="TOTAL"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Hide column" }),
    ).toBeInTheDocument();
  });

  it("should call onHideColumn with the columnId when the hide button is clicked", async () => {
    const onHideColumn = jest.fn();
    renderWithProviders(
      <HeaderCellWithColumnInfo
        {...defaultProps}
        onHideColumn={onHideColumn}
        columnId="TOTAL"
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Hide column" }),
    );

    expect(onHideColumn).toHaveBeenCalledWith("TOTAL");
    expect(onHideColumn).toHaveBeenCalledTimes(1);
  });

  it("should stop event propagation when the hide button is clicked", async () => {
    const onHideColumn = jest.fn();
    const onParentClick = jest.fn();

    const onParentClickHandler = onParentClick;
    renderWithProviders(
      <div role="button" tabIndex={0} onKeyDown={onParentClickHandler} onClick={onParentClickHandler}>
        <HeaderCellWithColumnInfo
          {...defaultProps}
          onHideColumn={onHideColumn}
          columnId="TOTAL"
        />
      </div>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Hide column" }),
    );

    expect(onHideColumn).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
