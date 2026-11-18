import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import DroppableSidebarCollectionLink from "./SidebarCollectionLink";

function setup({ name }: { name: string }) {
  renderWithProviders(
    <DroppableSidebarCollectionLink
      item={{ id: 1, name, icon: "folder" }}
      depth={0}
      hasChildren
      isExpanded={false}
      isSelected={false}
      onToggleExpand={jest.fn<void, []>()}
    />,
    { withDND: true },
  );
}

describe("DroppableSidebarCollectionLink", () => {
  it("shows the full name of a long collection on hover", async () => {
    const name = "Fifth collection with a very long name";
    setup({ name });

    await userEvent.hover(screen.getByText(name));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(name);
  });

  it("shows no tooltip for a short collection name on hover", async () => {
    const name = "Fourth collection";
    setup({ name });

    await userEvent.hover(screen.getByText(name));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
