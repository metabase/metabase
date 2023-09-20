import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  SearchFilterComponent,
  VerifiedFilterProps,
} from "metabase/search/types";
import type { ToggleSidebarFilterProps } from "metabase/search/components/SearchSidebar/ToggleSidebarFilter/ToggleSidebarFilter";
import { ToggleSidebarFilter } from "metabase/search/components/SearchSidebar/ToggleSidebarFilter/ToggleSidebarFilter";

const mockFilter: SearchFilterComponent = {
  title: "Mock Filter",
  iconName: "filter",
  type: "toggle",
};

const MockToggleSidebarFilter = ({
  filter,
  value,
  onChange,
}: ToggleSidebarFilterProps) => {
  const [toggleValue, setToggleValue] = useState(value);
  const onFilterChange = (elem: ToggleSidebarFilterProps["value"]) => {
    setToggleValue(elem);
    onChange(elem);
  };

  return (
    <ToggleSidebarFilter
      filter={filter}
      value={toggleValue}
      onChange={onFilterChange}
    />
  );
};

const setup = ({
  value = undefined,
  onChange = jest.fn(),
}: {
  value?: VerifiedFilterProps;
  onChange?: jest.Mock;
}) => {
  renderWithProviders(
    <MockToggleSidebarFilter
      filter={mockFilter}
      value={value}
      onChange={onChange}
    />,
  );

  return {
    onChange,
  };
};

describe("ToggleSidebarFilter", () => {
  it("should render the component with the title", () => {
    setup({
      onChange: jest.fn(),
    });

    const titleElement = screen.getByText(mockFilter.title);
    const switchElement = screen.getByTestId("toggle-filter-switch");

    expect(titleElement).toBeInTheDocument();
    expect(switchElement).toBeInTheDocument();
  });

  it("should call the onChange function when the switch is toggled", () => {
    const onChangeMock = jest.fn();
    setup({
      value: undefined,
      onChange: onChangeMock,
    });

    const switchElement = screen.getByRole("checkbox");
    userEvent.click(switchElement);

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith(true);

    expect(switchElement).toHaveAttribute("data-is-checked", "true");
  });

  it("should have the switch checked when value is true", () => {
    setup({
      value: true,
      onChange: jest.fn(),
    });

    const switchElement = screen.getByRole("checkbox");
    expect(switchElement).toHaveAttribute("data-is-checked", "true");
  });

  it("should have the switch unchecked when value is false", () => {
    setup({
      value: undefined,
    });

    const switchElement = screen.getByRole("checkbox");
    expect(switchElement).toHaveAttribute("data-is-checked", "false");
  });
});
