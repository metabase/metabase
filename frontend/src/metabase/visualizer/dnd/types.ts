import type { Active } from "@dnd-kit/core";

import type { DatasetColumn } from "metabase-types/api";

type BaseDraggedItem<T> = Omit<Active, "data"> & {
  data: {
    current: T;
  };
};

export type DraggedColumn = BaseDraggedItem<{
  type: "COLUMN";
  column: DatasetColumn;
}>;

export type DraggedItem = DraggedColumn;
