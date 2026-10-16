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

type SetupOpts = {
  cols: DatasetColumn[];
};

function setup({ cols }: SetupOpts) {
  const onUpdateVisualizationSettings = jest.fn<
    void,
    [Partial<VisualizationSettings>]
  >();

  const { rerender } = renderHook(
    ({ data }: { data: DatasetData }) =>
      useResetWidthsOnColumnsChange(onUpdateVisualizationSettings, data),
    { initialProps: { data: createMockDatasetData({ cols }) } },
  );

  const rerenderWithCols = (nextCols: DatasetColumn[]) =>
    rerender({ data: createMockDatasetData({ cols: nextCols }) });

  return { onUpdateVisualizationSettings, rerenderWithCols };
}

describe("useResetWidthsOnColumnsChange", () => {
  it("does not reset widths on the initial data", () => {
    const { onUpdateVisualizationSettings } = setup({
      cols: [COLUMN_A, COLUMN_B],
    });

    expect(onUpdateVisualizationSettings).not.toHaveBeenCalled();
  });

  it("does not reset widths when the same columns arrive in a different order", () => {
    const { onUpdateVisualizationSettings, rerenderWithCols } = setup({
      cols: [COLUMN_A, COLUMN_B],
    });

    rerenderWithCols([COLUMN_B, COLUMN_A]);

    expect(onUpdateVisualizationSettings).not.toHaveBeenCalled();
  });

  it("resets widths when a column is added", () => {
    const { onUpdateVisualizationSettings, rerenderWithCols } = setup({
      cols: [COLUMN_A, COLUMN_B],
    });

    rerenderWithCols([COLUMN_A, COLUMN_B, COLUMN_C]);

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": undefined,
    });
  });

  it("resets widths when a column's data changes", () => {
    const { onUpdateVisualizationSettings, rerenderWithCols } = setup({
      cols: [COLUMN_A, COLUMN_B],
    });

    rerenderWithCols([{ ...COLUMN_A, display_name: "renamed" }, COLUMN_B]);

    expect(onUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      "table.column_widths": undefined,
    });
  });
});
