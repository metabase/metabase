/* eslint-disable react/prop-types */
import userEvent, {
  PointerEventsCheckLevel,
} from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { SearchFilterComponent } from "metabase/search/types";

import type { DropdownSidebarFilterProps } from "./DropdownSidebarFilter";
import { DropdownSidebarFilter } from "./DropdownSidebarFilter";

const mockFilter: SearchFilterComponent = {
  label: () => "Mock Filter",
  iconName: "filter",
  type: "dropdown",
  DisplayComponent: ({ value }) => (
    <div data-testid="mock-display-component">
      {!value || value.length === 0 ? "Display" : value}
    </div>
  ),
  ContentComponent: ({ value, onChange }) => {
    const [filterValue, setFilterValue] = useState(value);

    return (
      <div data-testid="mock-content-component">
        <button onClick={() => setFilterValue(["new value"])}>Update</button>
        <div>{filterValue}</div>
        <button onClick={() => onChange(filterValue)}>Apply</button>
      </div>
    );
  },
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

describe("DropdownSidebarFilter", () => {
  it("should render filter title, filter icon, chevrondown, but no legend text when no value is selected", () => {
    setup();

    expect(screen.getByText("Mock Filter")).toBeInTheDocument();
    expect(screen.getByLabelText("filter icon")).toBeInTheDocument();
    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();

    expect(screen.queryByText("field-set-legend")).not.toBeInTheDocument();
  });

  it("should render filter display, close button, and filter value in the popover when value is initially selected", async () => {
    setup({ value: ["value1"] });

    expect(screen.getByTestId("field-set-legend")).toHaveTextContent(
      mockFilter.label(),
    );

    expect(screen.getByTestId("mock-display-component")).toBeInTheDocument();
    expect(screen.getByLabelText("close icon")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Mock Filter"));
    expect(
      within(screen.getByTestId("mock-content-component")).getByText("value1"),
    ).toBeInTheDocument();
  });

  it("should render filter content component when popover is open", async () => {
    setup();
    await userEvent.click(screen.getByText("Mock Filter"));
    expect(screen.getByTestId("mock-content-component")).toBeInTheDocument();
  });

  it("should apply filter and close popup when apply button is clicked", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Mock Filter"));
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(screen.getByText("new value")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

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

    await userEvent.click(screen.getByText("old value"));
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(screen.getByText("new value")).toBeInTheDocument();

    await userEvent.click(screen.getByText("old value"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("mock-display-component")).toHaveTextContent(
      "old value",
    );

    await userEvent.click(screen.getByText("old value"));
    expect(screen.getByTestId("mock-display-component")).toHaveTextContent(
      "old value",
    );
  });

  it("should reset filter selections when clear button is clicked", async () => {
    const { onChange } = setup({ value: ["old value"] });
    await userEvent.click(
      screen.getByTestId("sidebar-filter-dropdown-button"),
      // There's a problem with buttons in fieldsets so we have to skip pointer events check for now
      // https://github.com/testing-library/user-event/issues/662
      { pointerEventsCheck: PointerEventsCheckLevel.Never },
    );

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByText("Mock Filter")).toBeInTheDocument();
    expect(screen.getByLabelText("filter icon")).toBeInTheDocument();
    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();

    expect(screen.queryByText("field-set-legend")).not.toBeInTheDocument();
  });
});
