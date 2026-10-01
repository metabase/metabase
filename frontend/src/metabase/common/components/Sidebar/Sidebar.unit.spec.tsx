import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";

import { Sidebar } from "./Sidebar";

const setup = () => {
  const onClose = jest.fn();

  renderWithProviders(
    <Sidebar data-testid="test-sidebar" onClose={onClose}>
      <div>{"Sidebar content"}</div>
    </Sidebar>,
  );

  return { onClose };
};

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders in a resizable panel at the large width", () => {
    setup();

    const panel = screen.getByTestId("resizable-side-panel");
    expect(panel).toHaveStyle({ width: "400px" });
    expect(within(panel).getByTestId("test-sidebar")).toHaveTextContent(
      "Sidebar content",
    );
    expect(
      within(panel).getByTestId("side-panel-resize-handle"),
    ).toBeInTheDocument();
  });

  it("opens at the width the user last resized dashboard sidebars to", () => {
    setStoredSidePanelWidth("dashboard-sidebar", 460);

    setup();

    expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
      width: "460px",
    });
  });

  it("still renders its footer actions", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onClose).toHaveBeenCalled();
  });
});
