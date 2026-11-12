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

import { useSyncColumnWidths } from "./use-sync-column-widths";

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
      useSyncColumnWidths(onUpdateVisualizationSettings, data, columnWidths),
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

describe("useSyncColumnWidths", () => {
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

  it("does nothing when only the widths change, as on a resize", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    rerenderWith([COLUMN_A, COLUMN_B], [150, 200]);

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
    // The settings update from the first reorder renders before the next reorder
    rerenderWith([COLUMN_B, COLUMN_A, COLUMN_C], [200, 100, 300]);
    rerenderWith([COLUMN_C, COLUMN_B, COLUMN_A], [200, 100, 300]);

    expect(onUpdateVisualizationSettings).toHaveBeenNthCalledWith(1, {
      "table.column_widths": [200, 100, 300],
    });
    expect(onUpdateVisualizationSettings).toHaveBeenNthCalledWith(2, {
      "table.column_widths": [300, 200, 100],
    });
  });

  it("leaves widths alone when they changed together with the columns, as on history navigation", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    rerenderWith([COLUMN_B, COLUMN_A], [200, 100]);

    expect(onUpdateVisualizationSettings).not.toHaveBeenCalled();
  });

  it("keeps the widths of existing columns when a column is added", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    rerenderWith([COLUMN_A, COLUMN_C, COLUMN_B], [100, 200]);

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": [100, undefined, 200],
    });
  });

  it("drops the width of a removed column and keeps the others", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B, COLUMN_C],
      columnWidths: [100, 200, 300],
    });

    rerenderWith([COLUMN_A, COLUMN_C], [100, 200, 300]);

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": [100, 300],
    });
  });

  it("resets the setting when no remaining column has a saved width", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [212],
    });

    rerenderWith([COLUMN_B], [212]);

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": undefined,
    });
  });

  it("keeps a column's width when its metadata changes but its name does not", () => {
    const { onUpdateVisualizationSettings, rerenderWith } = setup({
      cols: [COLUMN_A, COLUMN_B],
      columnWidths: [100, 200],
    });

    rerenderWith(
      [{ ...COLUMN_A, display_name: "renamed" }, COLUMN_B],
      [100, 200],
    );

    expect(onUpdateVisualizationSettings).not.toHaveBeenCalled();
  });
});
