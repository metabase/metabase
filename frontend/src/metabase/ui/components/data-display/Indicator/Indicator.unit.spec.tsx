import { render, screen } from "__support__/ui";
import { Indicator } from "metabase/ui";

describe("Indicator", () => {
  it("doesn't intercept clicks meant for whatever it's wrapping (metabase#76154)", () => {
    render(
      <Indicator label="1">
        <button>Filter</button>
      </Indicator>,
    );

    const dot = screen.getByText("1");
    expect(dot).toHaveStyle({ pointerEvents: "none" });
  });
});
