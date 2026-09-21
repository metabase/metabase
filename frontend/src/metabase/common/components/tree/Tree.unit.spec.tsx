import { fireEvent, render, screen } from "__support__/ui";
import { Tree } from "metabase/common/components/tree";

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

const nestedData = [
  {
    id: "A",
    name: "A",
    icon: "group" as const,
    children: [{ id: "A1", name: "A1", icon: "group" as const }],
  },
  {
    id: "B",
    name: "B",
    icon: "group" as const,
    children: [{ id: "B1", name: "B1", icon: "group" as const }],
  },
];

describe("Tree", () => {
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

  it("expands ancestors when selecting a child whose parent was collapsed", () => {
    const { rerender } = render(
      <Tree data={nestedData} onSelect={jest.fn()} selectedId="A1" />,
    );

    expect(screen.getByText("A1")).toBeInTheDocument();

    // Collapse A by clicking its expand button
    const expandButtons = screen.getAllByRole("button");
    fireEvent.click(expandButtons[0]);
    expect(screen.queryByText("A1")).not.toBeInTheDocument();

    // Change selection to B1
    rerender(<Tree data={nestedData} onSelect={jest.fn()} selectedId="B1" />);
    expect(screen.getByText("B1")).toBeInTheDocument();

    // Change selection back to A1 — A should re-expand
    rerender(<Tree data={nestedData} onSelect={jest.fn()} selectedId="A1" />);
    expect(screen.getByText("A1")).toBeInTheDocument();
  });
});
