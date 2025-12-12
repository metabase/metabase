import type { ReactNode } from "react";

import type { SortColumn, SortDirection } from "../../types";

export type SortColumnItem = {
  value: SortColumn;
  label: string;
};

export type SortDirectionItem = {
  value: SortDirection;
  label: ReactNode;
};
