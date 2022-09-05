import React from "react";
import { render, fireEvent, act } from "@testing-library/react";

import { FilterableTree } from "./FilterableTree";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

const itemGroups = [
  [
    {
      id: 1,
      name: "Item 1 in Group 1",
      icon: "group",
    },
    {
      id: 2,
      name: "Item 2 in Group 1",
      icon: "group",
    },
  ],
  [
    {
      id: 3,
      name: "Item 1 in Group 2",
      icon: "group",
    },
    {
      id: 4,
      name: "Item 2 in Group 2",
      icon: "group",
      children: [
        {
          id: 5,
          name: "Child Item 3 in Group 3",
          icon: "group",
        },
      ],
    },
  ],
];

const placeholder = "Search for an item";

const setup = () => {
  const { getAllByRole, getByPlaceholderText, queryByText } = render(
    <FilterableTree
      itemGroups={itemGroups}
      placeholder={placeholder}
      onSelect={jest.fn()}
    />,
  );

  const filterInput = getByPlaceholderText(placeholder);

  return { filterInput, getAllByRole, queryByText };
};

describe("FilterableTree", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    jest.useFakeTimers();
  });

  it("allows to filter tree items", () => {
    const { filterInput, getAllByRole, queryByText } = setup();

    fireEvent.change(filterInput, { target: { value: "Item 1" } });

    act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_DURATION);
    });
    expect(getAllByRole("menuitem")).toHaveLength(2);

    expect(queryByText("Item 1 in Group 1")).not.toBeNull();
    expect(queryByText("Item 1 in Group 2")).not.toBeNull();
  });

  it("allows to filter nested tree items", () => {
    const { filterInput, getAllByRole, queryByText } = setup();

    fireEvent.change(filterInput, { target: { value: "Item 3" } });

    act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_DURATION);
    });
    expect(getAllByRole("menuitem")).toHaveLength(1);
    expect(queryByText("Child Item 3 in Group 3")).not.toBeNull();
  });
});
