import { render, screen, within } from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";

import { SidebarLayout } from "./SidebarLayout";

const setup = () => {
  render(
    <SidebarLayout sidebar={<nav>{"Reference nav"}</nav>}>
      <div>{"Reference content"}</div>
    </SidebarLayout>,
  );
};

describe("SidebarLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the sidebar in a resizable panel at the medium width", () => {
    setup();

    const panel = screen.getByTestId("resizable-side-panel");
    expect(panel).toHaveStyle({ width: "320px" });
    expect(within(panel).getByText("Reference nav")).toBeInTheDocument();
    expect(screen.getByText("Reference content")).toBeInTheDocument();
  });

  it("opens the sidebar at the width the user last resized it to", () => {
    setStoredSidePanelWidth("reference-nav", 300);

    setup();

    expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
      width: "300px",
    });
  });
});
