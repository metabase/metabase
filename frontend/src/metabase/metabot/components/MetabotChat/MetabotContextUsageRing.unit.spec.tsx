import { renderWithProviders, screen } from "__support__/ui";

import { MetabotContextUsageRing } from "./MetabotContextUsageRing";

describe("MetabotContextUsageRing", () => {
  it("draws the filled arc with flat caps", () => {
    renderWithProviders(<MetabotContextUsageRing percentUsage={90} />);

    const ring = screen.getByTestId("metabot-context-usage-ring");
    const curves = ring.querySelectorAll("circle");

    expect(curves.length).toBeGreaterThan(0);
    curves.forEach((curve) => {
      expect(curve).toHaveAttribute("stroke-linecap", "butt");
    });
  });

  it("rounds the percentage it announces", () => {
    renderWithProviders(<MetabotContextUsageRing percentUsage={90.4} />);

    expect(screen.getByTestId("metabot-context-usage-ring")).toHaveAttribute(
      "aria-label",
      "90% of the context window used",
    );
  });
});
