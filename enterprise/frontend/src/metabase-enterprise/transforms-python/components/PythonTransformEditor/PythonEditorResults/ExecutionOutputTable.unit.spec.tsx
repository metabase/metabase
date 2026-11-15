import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import type { TestPythonTransformResponse } from "metabase-types/api";

import { ExecutionOutputTable } from "./ExecutionOutputTable";

const OUTPUT: NonNullable<TestPythonTransformResponse["output"]> = {
  cols: [{ name: "value" }],
  rows: [{ value: "test" }],
};

const getBodyCell = () =>
  within(screen.getByRole("gridcell")).getByTestId("body-cell-container");

describe("ExecutionOutputTable", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  it("renders nothing when there is no output (metabase#78557)", () => {
    expect(() =>
      renderWithProviders(<ExecutionOutputTable output={undefined} />),
    ).not.toThrow();
  });

  it("does not remount cells when re-rendered with the same output (metabase#78557)", () => {
    const { rerender } = renderWithProviders(
      <ExecutionOutputTable output={OUTPUT} />,
    );
    const cell = getBodyCell();

    rerender(<ExecutionOutputTable output={OUTPUT} />);

    // A remounted cell is a new DOM node; a re-rendered one keeps its node
    expect(getBodyCell()).toBe(cell);
  });
});
