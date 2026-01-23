import type { ReactNode } from "react";

import type {
  DependencySortColumn,
  DependencySortDirection,
} from "metabase-types/api";

export type SortColumnItem = {
  value: DependencySortColumn;
  label: string;
};

export type SortDirectionItem = {
  value: DependencySortDirection;
  label: ReactNode;
};
