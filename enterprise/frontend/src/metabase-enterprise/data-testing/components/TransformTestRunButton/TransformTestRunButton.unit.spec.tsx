import { renderWithProviders, screen } from "__support__/ui";
import type { TransformTest } from "metabase-types/api";
import {
  createMockDataTestRun,
  createMockTransformTest,
} from "metabase-types/api/mocks";

import { TransformTestRunButton } from "./TransformTestRunButton";

type SetupOpts = {
  test: TransformTest;
};

function setup({ test }: SetupOpts) {
  return renderWithProviders(
    <TransformTestRunButton
      test={test}
      readOnly={false}
      triggeredFrom="test_overview"
    />,
  );
}

describe("TransformTestRunButton", () => {
  it("offers to run a test again when it re-renders with the same last run", () => {
    const test = createMockTransformTest({
      last_run: createMockDataTestRun({ status: "passed" }),
    });
    const { rerender } = setup({ test });

    rerender(
      <TransformTestRunButton
        test={test}
        readOnly={false}
        triggeredFrom="test_overview"
      />,
    );

    expect(screen.getByRole("button", { name: /Run now/ })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Ran successfully/ }),
    ).not.toBeInTheDocument();
  });
});
