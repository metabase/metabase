import { renderWithProviders, screen, within } from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";

import { AdminSettingsLayout } from "./AdminSettingsLayout";

type SetupOpts = {
  hasSidebar?: boolean;
};

const setup = ({ hasSidebar = true }: SetupOpts = {}) => {
  renderWithProviders(
    <AdminSettingsLayout
      sidebar={hasSidebar ? <nav>{"Admin nav"}</nav> : undefined}
    >
      <div>{"Settings content"}</div>
    </AdminSettingsLayout>,
    { withRouter: true },
  );
};

describe("AdminSettingsLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the sidebar in a resizable panel at the small width", () => {
    setup();

    const panel = screen.getByTestId("resizable-side-panel");
    expect(panel).toHaveStyle({ width: "256px" });
    expect(within(panel).getByTestId("admin-layout-sidebar")).toHaveTextContent(
      "Admin nav",
    );
    expect(
      within(panel).getByTestId("side-panel-resize-handle"),
    ).toBeInTheDocument();
  });

  it("opens the sidebar at the width the user last resized it to", () => {
    setStoredSidePanelWidth("admin-nav", 300);

    setup();

    expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
      width: "300px",
    });
  });

  it("renders only the content when there is no sidebar", () => {
    setup({ hasSidebar: false });

    expect(screen.getByText("Settings content")).toBeInTheDocument();
    expect(
      screen.queryByTestId("resizable-side-panel"),
    ).not.toBeInTheDocument();
  });
});
