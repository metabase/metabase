import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  TransientColumnVisibilityProvider,
  useTransientColumnVisibility,
} from "./TransientColumnVisibilityContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <TransientColumnVisibilityProvider>{children}</TransientColumnVisibilityProvider>
);

const TEST_COLUMNS = [
  { id: "col_a", name: "Column A" },
  { id: "col_b", name: "Column B" },
  { id: "col_c", name: "Column C" },
];

describe("TransientColumnVisibilityContext", () => {
  it("should start with no columns and no hidden columns", () => {
    const { result } = renderHook(() => useTransientColumnVisibility(), {
      wrapper,
    });

    expect(result.current?.allColumns).toEqual([]);
    expect(result.current?.hiddenColumnIds.size).toBe(0);
    expect(result.current?.hasHiddenColumns).toBe(false);
  });

  it("should register columns with setAllColumns", () => {
    const { result } = renderHook(() => useTransientColumnVisibility(), {
      wrapper,
    });

    act(() => {
      result.current?.setAllColumns(TEST_COLUMNS);
    });

    expect(result.current?.allColumns).toEqual(TEST_COLUMNS);
  });

  it("should hide a column with hideColumn", () => {
    const { result } = renderHook(() => useTransientColumnVisibility(), {
      wrapper,
    });

    act(() => {
      result.current?.setAllColumns(TEST_COLUMNS);
      result.current?.hideColumn("col_b");
    });

    expect(result.current?.hiddenColumnIds.has("col_b")).toBe(true);
    expect(result.current?.hiddenColumnIds.size).toBe(1);
    expect(result.current?.hasHiddenColumns).toBe(true);
  });

  it("should toggle column visibility with toggleColumnVisibility", () => {
    const { result } = renderHook(() => useTransientColumnVisibility(), {
      wrapper,
    });

    act(() => {
      result.current?.setAllColumns(TEST_COLUMNS);
    });

    // Hide
    act(() => {
      result.current?.toggleColumnVisibility("col_a");
    });
    expect(result.current?.hiddenColumnIds.has("col_a")).toBe(true);

    // Show again
    act(() => {
      result.current?.toggleColumnVisibility("col_a");
    });
    expect(result.current?.hiddenColumnIds.has("col_a")).toBe(false);
  });

  it("should clear all hidden columns with showAllColumns", () => {
    const { result } = renderHook(() => useTransientColumnVisibility(), {
      wrapper,
    });

    act(() => {
      result.current?.setAllColumns(TEST_COLUMNS);
      result.current?.hideColumn("col_a");
      result.current?.hideColumn("col_b");
    });

    expect(result.current?.hiddenColumnIds.size).toBe(2);

    act(() => {
      result.current?.showAllColumns();
    });

    expect(result.current?.hiddenColumnIds.size).toBe(0);
    expect(result.current?.hasHiddenColumns).toBe(false);
  });

  it("should return TableColumnOrderSetting[] from getVisibleColumnSettings", () => {
    const { result } = renderHook(() => useTransientColumnVisibility(), {
      wrapper,
    });

    act(() => {
      result.current?.setAllColumns(TEST_COLUMNS);
      result.current?.hideColumn("col_b");
    });

    const settings = result.current?.getVisibleColumnSettings();
    expect(settings).toEqual([
      { name: "col_a", enabled: true },
      { name: "col_b", enabled: false },
      { name: "col_c", enabled: true },
    ]);
  });

  it("should return null when used outside the provider", () => {
    const { result } = renderHook(() => useTransientColumnVisibility());

    expect(result.current).toBeNull();
  });
});
