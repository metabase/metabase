import { render, screen } from "__support__/ui";

import ScalarSkeleton from "./ScalarSkeleton";

describe("ScalarSkeleton", () => {
  it("should show a value pill", () => {
    render(<ScalarSkeleton />);

    const skeleton = screen.getByTestId("scalar-skeleton");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.querySelectorAll(".mb-mantine-Skeleton-root")).toHaveLength(
      1,
    );
  });

  it("should show the name instead of the title pill when provided", () => {
    render(<ScalarSkeleton name="Revenue" />);

    expect(screen.getByText("Revenue")).toBeInTheDocument();
  });
});
