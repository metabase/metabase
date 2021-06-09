import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, fireEvent } from "@testing-library/react";

import { Tree } from "metabase/admin/permissions/components/tree";

const data = [
  {
    id: 1,
    name: "Item 1",
    icon: "group",
  },
  {
    id: 2,
    name: "Item 2",
    icon: "group",
    children: [
      {
        id: 3,
        name: "Item 3",
        icon: "group",
      },
    ],
  },
];

describe("Tree", () => {
  it("should render items", () => {
    const { getAllByRole, queryByText } = render(
      <Tree data={data} onSelect={jest.fn()} />,
    );
    expect(getAllByRole("menuitem")).toHaveLength(2);
    expect(queryByText("Item 1")).not.toBeNull();
    expect(queryByText("Item 2")).not.toBeNull();
    expect(queryByText("Item 3")).toBeNull();
  });

  it("should render expand and collapse items with children", () => {
    const { getAllByRole, queryByText, getByRole } = render(
      <Tree data={data} onSelect={jest.fn()} />,
    );

    fireEvent.click(getByRole("button"));

    expect(getAllByRole("menuitem")).toHaveLength(3);
    expect(queryByText("Item 3")).not.toBeNull();

    fireEvent.click(getByRole("button"));
    expect(getAllByRole("menuitem")).toHaveLength(2);
    expect(queryByText("Item 3")).toBeNull();
  });

  it("should allow to select items", () => {
    const onSelectMock = jest.fn();
    const { getAllByRole } = render(
      <Tree data={data} onSelect={onSelectMock} />,
    );

    fireEvent.click(getAllByRole("menuitem")[0]);
    expect(onSelectMock).toHaveBeenCalledWith(1);
  });
});
