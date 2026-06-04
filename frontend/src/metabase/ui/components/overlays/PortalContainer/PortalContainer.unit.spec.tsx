import { render, screen } from "__support__/ui";
import { Tooltip } from "metabase/ui";

import { PORTAL_CONTAINER_ID } from "./";

describe("PortalContainer", () => {
  it("is mounted as a no-box (display: contents) portal target", () => {
    render(<div />);

    const container = document.getElementById(PORTAL_CONTAINER_ID);
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute("data-portal", "true");
    expect(container).toHaveStyle({ display: "contents" });
    expect(container).toBeEmptyDOMElement();
  });

  it("receives tooltip content rendered via the theme's portal target", async () => {
    render(
      <Tooltip opened label="portaled tooltip">
        <button>anchor</button>
      </Tooltip>,
    );

    const container = document.getElementById(PORTAL_CONTAINER_ID);
    const tooltip = await screen.findByText("portaled tooltip");
    expect(container).toContainElement(tooltip);
  });
});
