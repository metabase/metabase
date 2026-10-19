import { renderHook } from "@testing-library/react";

import type {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { useResetWidthsOnColumnsChange } from "./use-reset-widths-on-columns-change";

const COLUMN_A = createMockColumn({ id: 1, name: "a", display_name: "a" });
const COLUMN_B = createMockColumn({ id: 2, name: "b", display_name: "b" });
const COLUMN_C = createMockColumn({ id: 3, name: "c", display_name: "c" });

type HookProps = {
  data: DatasetData;
  columnWidths?: number[];
};

type SetupOpts = {
  cols: DatasetColumn[];
  columnWidths?: number[];
};

function setup({ cols, columnWidths }: SetupOpts) {
  const onUpdateVisualizationSettings = jest.fn<
    void,
    [Partial<VisualizationSettings>]
  >();

  const { rerender } = renderHook(
    ({ data, columnWidths }: HookProps) =>
      useResetWidthsOnColumnsChange(
        onUpdateVisualizationSettings,
        data,
        undefined,
        columnWidths,
      ),
    {
      initialProps: { data: createMockDatasetData({ cols }), columnWidths },
    },
  );

  const rerenderWith = (nextCols: DatasetColumn[], nextWidths?: number[]) =>
    rerender({
      data: createMockDatasetData({ cols: nextCols }),
      columnWidths: nextWidths,
    });

  return { onUpdateVisualizationSettings, rerenderWith };
}

describe("useResetWidthsOnColumnsChange", () => {
  it("does nothing on the initial data", () => {
    const { onUpdateVisualizationSettings } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    expect(onUpdateVisualizationSettings).not.toHaveBeenCalled();
  });

  it("does nothing when the same columns arrive in the same order", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    rerenderWith([COLUMN_A, COLUMN_B], [100, 200]);

    expect(onUpdateVisualizationSettings).not.toHaveBeenCalled();
  });

  it("moves saved widths with their columns when the columns are reordered", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    rerenderWith([COLUMN_B, COLUMN_A], [100, 200]);

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": [200, 100],
    });
  });

  it("keeps unsized columns auto-sized when only one column has a saved width", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [212],
    });

    rerenderWith([COLUMN_B, COLUMN_A], [212]);

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": [undefined, 212],
    });
  });

  it("does not touch settings on a reorder without saved widths", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
    });

    rerenderWith([COLUMN_B, COLUMN_A]);

    expect(onUpdateVisualizationSettings).not.toHaveBeenCalled();
  });

  it("remaps against the latest order on consecutive reorders", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B, COLUMN_C],
      columnWidths: [100, 200, 300],
    });

    rerenderWith([COLUMN_B, COLUMN_A, COLUMN_C], [100, 200, 300]);
    rerenderWith([COLUMN_C, COLUMN_B, COLUMN_A], [200, 100, 300]);

    expect(onUpdateVisualizationSettings).toHaveBeenNthCalledWith(1, {
      "table.column_widths": [200, 100, 300],
    });
    expect(onUpdateVisualizationSettings).toHaveBeenNthCalledWith(2, {
      "table.column_widths": [300, 200, 100],
    });
  });

  it("resets widths when a column is added", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    rerenderWith([COLUMN_A, COLUMN_B, COLUMN_C], [100, 200]);

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": undefined,
    });
  });

  it("resets widths when a column's data changes", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    rerenderWith(
      [{ ...COLUMN_A, display_name: "renamed" }, COLUMN_B],
      [100, 200],
    );

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": undefined,
    });
  });
});
