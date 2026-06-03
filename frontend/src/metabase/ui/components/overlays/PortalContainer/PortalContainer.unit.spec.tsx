import { render, screen } from "__support__/ui";
import { Tooltip } from "metabase/ui";

import { PORTAL_CONTAINER_ID, PortalContainer } from "./";

describe("PortalContainer", () => {
  it("renders a portal target with the shared id and data-portal marker", () => {
    render(<PortalContainer />);

    const container = document.getElementById(PORTAL_CONTAINER_ID);
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute("data-portal", "true");
  });

  it("stays out of the normal flow and renders nothing visible", () => {
    render(<PortalContainer />);

    const container = document.getElementById(PORTAL_CONTAINER_ID);
    expect(container).toHaveStyle({ position: "fixed" });
    expect(container).toBeEmptyDOMElement();
  });

  it("receives tooltip content rendered via the theme's portal target", async () => {
    render(
      <>
        <PortalContainer />
        <Tooltip opened label="portaled tooltip">
          <button>anchor</button>
        </Tooltip>
      </>,
    );

    const container = document.getElementById(PORTAL_CONTAINER_ID);
    const tooltip = await screen.findByText("portaled tooltip");
    expect(container).toContainElement(tooltip);
  });
});
