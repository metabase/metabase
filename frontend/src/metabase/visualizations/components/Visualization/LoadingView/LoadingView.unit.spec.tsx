import { screen, renderWithProviders } from "__support__/ui";

import LoadingView from "./LoadingView";

type SetupOpts = {
  expectedDuration: number;
  isSlow: "usually-slow" | boolean;
};

function setup(opts: SetupOpts) {
  renderWithProviders(<LoadingView {...opts} />);
}

describe("LoadingView", () => {
  it("should only render the spinner when the query is usually fast", () => {
    setup({
      expectedDuration: 10,
      isSlow: false,
    });

    expect(screen.queryByText("Still Waiting…")).not.toBeInTheDocument();
  });

  it("should show 'Still waiting' when the query is usually slow", () => {
    setup({
      expectedDuration: 10_000,
      isSlow: "usually-slow",
    });

    expect(screen.getByText("Still Waiting…")).toBeInTheDocument();
    expect(
      screen.getByText(/This usually takes an average of/),
    ).toBeInTheDocument();
    expect(screen.getByText("10 seconds")).toBeInTheDocument();
    expect(
      screen.getByText(/but is currently taking longer./),
    ).toBeInTheDocument();
  });
});
