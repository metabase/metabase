import { renderWithProviders, screen } from "__support__/ui";

import { LibraryNav } from "./LibraryNav";

describe("LibraryNav", () => {
  it("should render Settings and Workspaces as child nav items", () => {
    renderWithProviders(<LibraryNav />);

    expect(screen.getByText("Remote sync")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
  });
});
