import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import type { ToggleSidebarFilterProps } from "metabase/search/components/ToggleSidebarFilter";
import { ToggleSidebarFilter } from "metabase/search/components/ToggleSidebarFilter";
import type { SearchFilterComponent } from "metabase/search/types";

const mockFilter: SearchFilterComponent = {
  label: () => "Mock Filter",
  iconName: "filter",
  type: "toggle",
  fromUrl: value => value,
  toUrl: value => value,
};

const MockToggleSidebarFilter = ({
  filter,
  value,
  onChange,
}: ToggleSidebarFilterProps) => {
  const [toggleValue, setToggleValue] = useState(value);
  const onFilterChange = (toggleValue: ToggleSidebarFilterProps["value"]) => {
    setToggleValue(toggleValue);
    onChange(toggleValue);
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
  value = false,
  onChange = jest.fn(),
}: {
  value?: ToggleSidebarFilterProps["value"];
  onChange?: jest.Mock;
} = {}) => {
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

    const titleElement = screen.getByText("Mock Filter");
    const switchElement = screen.getByTestId("toggle-filter-switch");

    expect(titleElement).toBeInTheDocument();
    expect(switchElement).toBeInTheDocument();
  });

  it("should call the onChange function when the switch is toggled", async () => {
    const onChangeMock = jest.fn();
    setup({
      value: undefined,
      onChange: onChangeMock,
    });

    const switchElement = screen.getByRole("checkbox");
    await userEvent.click(switchElement);

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
    setup();

    const switchElement = screen.getByRole("checkbox");
    expect(switchElement).toHaveAttribute("data-is-checked", "false");
  });
});
