import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DroppableSidebarCollectionLink } from "./SidebarCollectionLink";

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

  it("shows the full name of a long collection when its link has focus (#85912)", async () => {
    const name = "A collection with a name long enough to be truncated";

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

    await userEvent.tab(); // the expand toggle
    await userEvent.tab();

    expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(name);
  });
});
