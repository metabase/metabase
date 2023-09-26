/* eslint-disable react/prop-types */
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { SearchFilterComponent } from "metabase/search/types";
import type { DropdownSidebarFilterProps } from "./DropdownSidebarFilter";
import { DropdownSidebarFilter } from "./DropdownSidebarFilter";

const mockFilter: SearchFilterComponent = {
  title: "Mock Filter",
  iconName: "filter",
  type: "dropdown",
  DisplayComponent: ({ value }) => (
    <div data-testid="mock-display-component">
      {!value || value.length === 0 ? "Display" : value}
    </div>
  ),
  ContentComponent: ({ value, onChange, onApply }) => (
    <div data-testid="mock-content-component">
      <button onClick={() => onChange(["new value"])}>Update</button>
      <div>{value}</div>
    </div>
  ),
  fromUrl: value => value,
  toUrl: value => value,
};

const MockSearchSidebarFilter = ({
  filter,
  value,
  onChange,
}: DropdownSidebarFilterProps) => {
  const [selectedValues, setSelectedValues] = useState(value);
  const onFilterChange = (elem: DropdownSidebarFilterProps["value"]) => {
    setSelectedValues(elem);
    onChange(elem);
  };

  return (
    <DropdownSidebarFilter
      filter={filter}
      value={selectedValues}
      onChange={onFilterChange}
    />
  );
};

const setup = (options: Partial<DropdownSidebarFilterProps> = {}) => {
  const defaultProps: DropdownSidebarFilterProps = {
    filter: mockFilter,
    value: [],
    onChange: jest.fn(),
  };

  const props: DropdownSidebarFilterProps = { ...defaultProps, ...options };

  renderWithProviders(<MockSearchSidebarFilter {...props} />);

  return {
    onChange: defaultProps.onChange,
  };
};

describe("SidebarFilter", () => {
  it("should render filter title, filter icon, chevrondown, but no legend text when no value is selected", () => {
    setup();

    expect(screen.getByText("Mock Filter")).toBeInTheDocument();
    expect(screen.getByLabelText("filter icon")).toBeInTheDocument();
    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();

    expect(screen.queryByText("field-set-legend")).not.toBeInTheDocument();
  });

  it("should render filter display, close button, and filter value in the popover when value is initially selected", () => {
    setup({ value: ["value1"] });

    expect(screen.getByTestId("field-set-legend")).toHaveTextContent(
      mockFilter.title,
    );

    expect(screen.getByTestId("mock-display-component")).toBeInTheDocument();
    expect(screen.getByLabelText("close icon")).toBeInTheDocument();

    userEvent.click(screen.getByText("Mock Filter"));
    expect(
      within(screen.getByTestId("mock-content-component")).getByText("value1"),
    ).toBeInTheDocument();
  });

  it("should render filter content component when popover is open", () => {
    setup();
    userEvent.click(screen.getByText("Mock Filter"));
    expect(screen.getByTestId("mock-content-component")).toBeInTheDocument();
  });

  it("should apply filter and close popup when apply button is clicked", () => {
    const { onChange } = setup();
    userEvent.click(screen.getByText("Mock Filter"));
    userEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(screen.getByText("new value")).toBeInTheDocument();

    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(onChange).toHaveBeenCalledWith(["new value"]);

    expect(screen.getByTestId("mock-display-component")).toHaveTextContent(
      "new value",
    );

    expect(
      screen.queryByTestId("mock-content-component"),
    ).not.toBeInTheDocument();
  });

  it("should revert filter selections when popover is closed", async () => {
    const { onChange } = setup({ value: ["old value"] });

    userEvent.click(screen.getByText("Mock Filter"));
    userEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(screen.getByText("new value")).toBeInTheDocument();

    userEvent.click(screen.getByText("Mock Filter"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("mock-display-component")).toHaveTextContent(
      "old value",
    );
  });

  it("should reset filter selections when clear button is clicked", async () => {
    const { onChange } = setup({ value: ["old value"] });
    userEvent.click(screen.getByTestId("sidebar-filter-dropdown-button"));

    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByText("Mock Filter")).toBeInTheDocument();
    expect(screen.getByLabelText("filter icon")).toBeInTheDocument();
    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();

    expect(screen.queryByText("field-set-legend")).not.toBeInTheDocument();
  });
});
