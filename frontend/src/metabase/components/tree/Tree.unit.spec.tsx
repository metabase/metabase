import { render, fireEvent, screen } from "@testing-library/react";

import { Tree } from "metabase/components/tree";

const data = [
  {
    id: 1,
    name: "Item 1",
    icon: "group" as const,
  },
  {
    id: 2,
    name: "Item 2",
    icon: "group" as const,
    children: [
      {
        id: 3,
        name: "Item 3",
        icon: "group" as const,
      },
    ],
  },
];

describe("Tree", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it("should render collapsed items when selectedId is not specified", () => {
    render(<Tree data={data} onSelect={jest.fn()} />);
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.queryByText("Item 3")).not.toBeInTheDocument();
  });

  it("expands tree to the selected item", () => {
    render(<Tree data={data} onSelect={jest.fn()} selectedId={3} />);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("should render expand and collapse items with children", () => {
    render(<Tree data={data} onSelect={jest.fn()} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(screen.getByText("Item 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.queryByText("Item 3")).not.toBeInTheDocument();
  });

  it("should allow to select items", () => {
    const onSelectMock = jest.fn();
    render(<Tree data={data} onSelect={onSelectMock} />);

    fireEvent.click(screen.getAllByRole("menuitem")[0]);
    expect(onSelectMock).toHaveBeenCalledWith(data[0]);
  });
});
