import type { ReactNode } from "react";

import type { IconName } from "metabase-types/api";

export type FilterTree<F> =
  | { type: "leaf"; filter: F }
  | { type: "and"; children: readonly FilterTree<F>[] }
  | { type: "or"; children: readonly FilterTree<F>[] };

export type FilterStages<F> = readonly FilterTree<F>[];

export type FilterColumn = {
  key: string;
  label: string;
  icon: IconName;
};

export type ValueKind = "none" | "single" | "range" | "multi";

export type FilterOperator = {
  key: string;
  label: string;
  valueKind: ValueKind;
};

export type FilterParts = {
  column: FilterColumn;
  operator: FilterOperator;
  values: readonly unknown[];
};

export type PillContent =
  | { type: "parts"; parts: FilterParts }
  | { type: "opaque"; displayName: string; icon: IconName };

export type ColumnItem<F> =
  | { type: "column"; column: FilterColumn; stage?: number }
  | { type: "filter"; filter: F };

export type ColumnSection<F> = {
  label?: string;
  items: readonly ColumnItem<F>[];
};

export type ColumnGroup<F> = {
  label: string;
  icon: IconName;
  sections: readonly ColumnSection<F>[];
};

export type FilterEditorProps<F> = (
  | { type: "edit"; filter: F }
  | { type: "new"; column: FilterColumn | null }
) & {
  onChange: (filter: F) => void;
  onClose: () => void;
};

export type FilterBarStageAdapter<F> = {
  columnGroups: () => readonly ColumnGroup<F>[];
  operators: (column: FilterColumn) => readonly FilterOperator[] | null;
  toFilter: (parts: FilterParts) => F | null;
  toPill: (filter: F) => PillContent;
  formatValues: (parts: FilterParts) => string;
  renderFilterEditor?: (props: FilterEditorProps<F>) => ReactNode;
};

export type FilterBarAdapter<F> = {
  supportsOr: boolean;
  stage: (index: number) => FilterBarStageAdapter<F>;
};

export type FilterBarProps<F> = {
  value: FilterStages<F>;
  onChange: (stages: FilterStages<F>) => void;
  adapter: FilterBarAdapter<F>;
};
