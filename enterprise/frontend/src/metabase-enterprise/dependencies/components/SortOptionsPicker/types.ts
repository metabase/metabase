import type { ReactNode } from "react";

import type { DependencySortColumn, SortDirection } from "metabase-types/api";

export type SortColumnItem = {
  value: DependencySortColumn;
  label: string;
};

export type SortDirectionItem = {
  value: SortDirection;
  label: ReactNode;
};
