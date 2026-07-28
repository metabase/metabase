import { act, renderHook } from "@testing-library/react";

import { useDataGridInstance } from "./use-data-grid-instance";

type TestRow = { value: string };

const DATA: TestRow[] = [{ value: "value" }];
const COLUMNS_OPTIONS = [
  {
    id: "value",
    name: "Value",
    accessorFn: (row: TestRow) => row.value,
  },
];

describe("useDataGridInstance", () => {
  it("keeps the header component mounted when a column is resized", () => {
    const { result } = renderHook(() =>
      useDataGridInstance<TestRow, string>({
        data: DATA,
        columnsOptions: COLUMNS_OPTIONS,
      }),
    );
    const initialHeader =
      result.current.table.getColumn("value")?.columnDef.header;

    act(() => {
      result.current.table.setColumnSizing({ value: 200 });
    });

    expect(result.current.table.getColumn("value")?.columnDef.header).toBe(
      initialHeader,
    );
  });
});
