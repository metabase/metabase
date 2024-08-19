import { render, screen } from "__support__/ui";

import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("should not crash", () => {
    render(<Sparkline data={[]} height={120} width={0} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
