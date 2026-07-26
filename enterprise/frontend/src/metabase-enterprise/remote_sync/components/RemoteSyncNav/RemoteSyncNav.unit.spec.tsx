import { renderWithProviders, screen } from "__support__/ui";

import { RemoteSyncNav } from "./RemoteSyncNav";

describe("RemoteSyncNav", () => {
  it("should render Remote sync and Workspaces as standalone nav items", () => {
    renderWithProviders(<RemoteSyncNav />);

    expect(screen.getByText("Remote sync")).toBeInTheDocument();
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
    // The old subnav had a nested "Settings" child; the pages are standalone now.
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });
});
