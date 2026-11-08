import { act, renderHook } from "@testing-library/react";

import { ROW_HEIGHT } from "../constants";
import type { ColumnOptions } from "../types";

import { useDataGridInstance } from "./use-data-grid-instance";

type TestRow = { value: string };
type TwoColumnRow = { a: string; b: string };
type NullableRow = { value: string | null };

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

const TWO_COLUMN_DATA: TwoColumnRow[] = [{ a: "1", b: "2" }];
const TWO_COLUMNS_OPTIONS = [
  { id: "a", name: "a", accessorFn: (row: TwoColumnRow) => row.a },
  { id: "b", name: "b", accessorFn: (row: TwoColumnRow) => row.b },
];

describe("useDataGridInstance", () => {
  describe("controlled column widths", () => {
    it("drops the width of a column whose controlled width was removed instead of keeping it", () => {
      const initialProps: { columnSizingMap: Record<string, number> } = {
        columnSizingMap: { a: 300 },
      };
      const { result, rerender } = renderHook(
        ({ columnSizingMap }: typeof initialProps) =>
          useDataGridInstance<TwoColumnRow, string>({
            data: TWO_COLUMN_DATA,
            columnsOptions: TWO_COLUMNS_OPTIONS,
            columnSizingMap,
          }),
        { initialProps },
      );

      expect(result.current.table.getState().columnSizing.a).toBe(300);

      rerender({ columnSizingMap: { b: 300 } });

      const { columnSizing } = result.current.table.getState();
      expect(columnSizing.b).toBe(300);
      expect(columnSizing.a).not.toBe(300);
    });
  });

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

    it("puts values that depend on the column width on meta, to avoid remounting cells on resize", () => {
      const { result } = renderHook(() =>
        useDataGridInstance<TestRow, string>({
          data: DATA,
          columnsOptions: COLUMNS_OPTIONS,
        }),
      );

      const meta = result.current.table.getColumn("value")?.columnDef.meta;

      expect(meta).toMatchObject({
        isTruncated: false,
        onExpand: expect.any(Function),
      });
    });
  });

  describe("minRowHeight", () => {
    interface SetupOpts {
      data: NullableRow[];
      minRowHeight: number;
    }

    const setup = ({ data, minRowHeight }: SetupOpts) => {
      const columnsOptions: ColumnOptions<NullableRow, string | null>[] = [
        {
          id: "value",
          name: "Value",
          accessorFn: (row) => row.value,
          minRowHeight,
        },
      ];
      // Pagination turns off row virtualization, so every row reports the
      // height computed for it
      const { result } = renderHook(() =>
        useDataGridInstance<NullableRow, string | null>({
          data,
          columnsOptions,
          pageSize: data.length,
        }),
      );
      return result.current.getCenterRows().map((row) => ({
        value: row.origin.original.value,
        height: row.height,
      }));
    };

    it("makes rows with a value in the column at least that tall", () => {
      const rows = setup({
        data: [{ value: "https://example.com/a.png" }, { value: "b" }],
        minRowHeight: 156,
      });

      expect(rows).toEqual([
        { value: "https://example.com/a.png", height: 156 },
        { value: "b", height: 156 },
      ]);
    });

    it("keeps the default height for rows with an empty value in the column", () => {
      const rows = setup({
        data: [{ value: "https://example.com/a.png" }, { value: null }],
        minRowHeight: 156,
      });

      expect(rows).toEqual([
        { value: "https://example.com/a.png", height: 156 },
        { value: null, height: ROW_HEIGHT },
      ]);
    });

    it("never makes rows shorter than the default height", () => {
      const rows = setup({
        data: [{ value: "a" }],
        minRowHeight: ROW_HEIGHT - 10,
      });

      expect(rows).toEqual([{ value: "a", height: ROW_HEIGHT }]);
    });
  });
});
