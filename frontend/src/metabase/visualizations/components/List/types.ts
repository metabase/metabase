import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { Row } from "metabase-types/types/Dataset";

export type ListVariant = "basic" | "info";

export interface ListColumnIndexes {
  left: number[];
  right: number[];
  image: number[];
}

export type ListVariantProps = Pick<VisualizationProps, "settings" | "data"> & {
  row: Row;
  listColumnIndexes: ListColumnIndexes;
  getColumnTitle: (columnIndex: number) => string;
};
