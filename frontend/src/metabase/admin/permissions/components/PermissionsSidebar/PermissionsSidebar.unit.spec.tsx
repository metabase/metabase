import { renderWithProviders, screen, within } from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";

import { PermissionsSidebar } from "./PermissionsSidebar";

const setup = () => {
  renderWithProviders(
    <PermissionsSidebar
      isLoading
      filterPlaceholder="Search for a group"
      entityGroups={[]}
      onSelect={jest.fn()}
    />,
  );
};

describe("PermissionsSidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders in a resizable panel at the medium width", () => {
    setup();

    const panel = screen.getByTestId("resizable-side-panel");
    expect(panel).toHaveStyle({ width: "320px" });
    expect(
      within(panel).getByTestId("side-panel-resize-handle"),
    ).toBeInTheDocument();
  });

  it("opens at the width the user last resized it to", () => {
    setStoredSidePanelWidth("admin-permissions-nav", 300);

    setup();

    expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
      width: "300px",
    });
  });
});
