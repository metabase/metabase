import { renderWithProviders, screen } from "__support__/ui";
import type { TransformTest } from "metabase-types/api";
import {
  createMockTransformTest,
  createMockTransformTestRun,
} from "metabase-types/api/mocks";

import { TransformTestRunSection } from "./TransformTestRunSection";

type SetupOpts = {
  test: TransformTest;
};

function setup({ test }: SetupOpts) {
  return renderWithProviders(
    <TransformTestRunSection test={test} readOnly={false} />,
  );
}

describe("TransformTestRunSection", () => {
  it("offers to run a test again when it re-renders with the same last run", () => {
    const test = createMockTransformTest({
      last_run: createMockTransformTestRun({ status: "passed" }),
    });
    const { rerender } = setup({ test });

    rerender(<TransformTestRunSection test={test} readOnly={false} />);

    expect(screen.getByRole("button", { name: /Run now/ })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Ran successfully/ }),
    ).not.toBeInTheDocument();
  });
});
