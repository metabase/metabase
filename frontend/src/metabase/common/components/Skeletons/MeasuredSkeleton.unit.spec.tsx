import { render, screen } from "__support__/ui";

import { MeasuredSkeleton } from "./MeasuredSkeleton";

interface SetupOpts {
  loading: boolean;
}

const setup = ({ loading }: SetupOpts) =>
  render(
    <MeasuredSkeleton loading={loading} id="test-skeleton">
      <button>{loading ? "Sample action" : "Real action"}</button>
    </MeasuredSkeleton>,
  );

describe("MeasuredSkeleton", () => {
  it("hides the sample content from assistive tech and marks the region loading", () => {
    setup({ loading: true });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the content once loaded", () => {
    const { rerender } = setup({ loading: true });

    rerender(
      <MeasuredSkeleton loading={false} id="test-skeleton">
        <button>Real action</button>
      </MeasuredSkeleton>,
    );

    expect(
      screen.getByRole("button", { name: "Real action" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });
});
