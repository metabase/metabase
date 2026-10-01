import { renderWithProviders, screen, within } from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";

import { PolicySidePanel } from "./PolicySidePanel";

const setup = () => {
  renderWithProviders(
    <PolicySidePanel title="Orders" onClose={jest.fn()}>
      <div>{"Policy form"}</div>
    </PolicySidePanel>,
  );
};

describe("PolicySidePanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders in a resizable panel at the large width", () => {
    setup();

    const panel = screen.getByTestId("resizable-side-panel");
    expect(panel).toHaveStyle({ width: "400px" });
    expect(within(panel).getByTestId("cache-policy-panel")).toHaveTextContent(
      "Policy form",
    );
  });

  it("opens at the width the user last resized it to", () => {
    setStoredSidePanelWidth("caching-policy-panel", 460);

    setup();

    expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
      width: "460px",
    });
  });
});
