import { render, fireEvent, act, screen } from "@testing-library/react";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

import { FilterableTree } from "./FilterableTree";

const itemGroups = [
  [
    {
      id: 1,
      name: "Item 1 in Group 1",
      icon: "group" as const,
    },
    {
      id: 2,
      name: "Item 2 in Group 1",
      icon: "group" as const,
    },
  ],
  [
    {
      id: 3,
      name: "Item 1 in Group 2",
      icon: "group" as const,
    },
    {
      id: 4,
      name: "Item 2 in Group 2",
      icon: "group" as const,
      children: [
        {
          id: 5,
          name: "Child Item 3 in Group 3",
          icon: "group" as const,
        },
      ],
    },
  ],
];

const placeholder = "Search for an item";

const setup = () => {
  render(
    <FilterableTree
      itemGroups={itemGroups}
      placeholder={placeholder}
      onSelect={jest.fn()}
    />,
  );

  const filterInput = screen.getByPlaceholderText(placeholder);

  return { filterInput };
};

describe("FilterableTree", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    jest.useFakeTimers();
  });

  it("allows to filter tree items", () => {
    const { filterInput } = setup();

    fireEvent.change(filterInput, { target: { value: "Item 1" } });

    act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_DURATION);
    });
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);

    expect(screen.getByText("Item 1 in Group 1")).toBeInTheDocument();
    expect(screen.getByText("Item 1 in Group 2")).toBeInTheDocument();
  });

  it("allows to filter nested tree items", () => {
    const { filterInput } = setup();

    fireEvent.change(filterInput, { target: { value: "Item 3" } });

    act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_DURATION);
    });
    expect(screen.getByRole("menuitem")).toBeInTheDocument();
    expect(screen.getByText("Child Item 3 in Group 3")).toBeInTheDocument();
  });
});
