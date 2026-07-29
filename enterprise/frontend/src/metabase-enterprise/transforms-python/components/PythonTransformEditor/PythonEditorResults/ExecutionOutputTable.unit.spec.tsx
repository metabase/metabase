import { render } from "@testing-library/react";

import { useDataGridInstance } from "metabase/data-grid";
import type { TestPythonTransformResponse } from "metabase-types/api";

import { ExecutionOutputTable } from "./ExecutionOutputTable";

jest.mock("metabase/data-grid", () => ({
  DataGrid: () => null,
  useDataGridInstance: jest.fn(),
}));

const mockUseDataGridInstance = jest.mocked(useDataGridInstance);

const OUTPUT: NonNullable<TestPythonTransformResponse["output"]> = {
  cols: [{ name: "value" }],
  rows: [{ value: "test" }],
};

describe("ExecutionOutputTable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps column options stable between renders", () => {
    const { rerender } = render(<ExecutionOutputTable output={OUTPUT} />);
    const initialColumnsOptions =
      mockUseDataGridInstance.mock.calls[0][0].columnsOptions;

    rerender(<ExecutionOutputTable output={OUTPUT} />);

    expect(mockUseDataGridInstance).toHaveBeenCalledTimes(2);
    expect(mockUseDataGridInstance.mock.calls[1][0].columnsOptions).toBe(
      initialColumnsOptions,
    );
  });
});
