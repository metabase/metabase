import { renderWithProviders, screen } from "__support__/ui";
import type { TransformRun } from "metabase-types/api";
import { createMockTransformRun } from "metabase-types/api/mocks";

import { ErrorSection } from "./ErrorSection";

type SetupOpts = {
  run?: TransformRun;
};

function setup({ run = createMockTransformRun() }: SetupOpts = {}) {
  renderWithProviders(<ErrorSection run={run} />);
}

describe("ErrorSection", () => {
  it("should render the error title and message", () => {
    const run = createMockTransformRun({
      status: "failed",
      message: 'relation "abc" does not exist',
    });
    setup({ run });

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Error" })).toBeInTheDocument();
  });

  it("should not render when message is null", () => {
    const run = createMockTransformRun({ message: null });
    setup({ run });

    expect(screen.queryByText("Error")).not.toBeInTheDocument();
  });
});
