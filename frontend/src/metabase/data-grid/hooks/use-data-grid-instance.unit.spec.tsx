import { act, renderHook } from "@testing-library/react";

import { useDataGridInstance } from "./use-data-grid-instance";

type TestRow = { value: string };

// Module scope so the hook sees a stable reference across renders, which is
// what the fix relies on
const DATA: TestRow[] = [{ value: "value" }];
const COLUMNS_OPTIONS = [
  {
    id: "value",
    name: "Value",
    accessorFn: (row: TestRow) => row.value,
  },
];

describe("useDataGridInstance", () => {
  describe("issue 78557", () => {
    it("keeps cell and header component identity across a column resize", () => {
      const { result } = renderHook(() =>
        useDataGridInstance<TestRow, string>({
          data: DATA,
          columnsOptions: COLUMNS_OPTIONS,
        }),
      );

      const before = result.current.table.getColumn("value")?.columnDef;
      // Without this the assertions below pass when both sides are undefined
      expect(before?.cell).toBeDefined();
      expect(before?.header).toBeDefined();

      act(() => {
        result.current.table.setColumnSizing({ value: 200 });
      });

      const after = result.current.table.getColumn("value")?.columnDef;

      // A new component type per resize tick makes React remount every cell
      // instead of re-rendering it, which ends in "Maximum update depth exceeded"
      expect(after?.cell).toBe(before?.cell);
      expect(after?.header).toBe(before?.header);
    });

    it("populates column meta with the width-dependent values instead of closing over them", () => {
      const { result } = renderHook(() =>
        useDataGridInstance<TestRow, string>({
          data: DATA,
          columnsOptions: COLUMNS_OPTIONS,
        }),
      );

      const meta = result.current.table.getColumn("value")?.columnDef.meta;

      expect(meta?.isTruncated).toBe(false);
      expect(typeof meta?.onExpand).toBe("function");
    });
  });
});
