import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("MetricEditorSidebar (OSS)", () => {
  it("should render the metric docs link", () => {
    setup();
    const link = screen.getByRole("link", { name: /Docs/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("data-modeling/segments-and-metrics"),
    );
  });
});
