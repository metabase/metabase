import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { Row } from "metabase-types/types/Dataset";
export type ListVariant = "basic" | "info";

export type ListVariantProps = Pick<VisualizationProps, "settings" | "data"> & {
  row: Row;
  listColumnIndexes: { left: number[]; right: number[] };
  getColumnTitle: (columnIndex: number) => string;
};
