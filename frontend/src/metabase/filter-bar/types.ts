import type { ReactNode } from "react";

import type { IconName } from "metabase-types/api";

type LeafTree<F> = { type: "leaf"; filter: F };

export type FilterTree<F> =
  | LeafTree<F>
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

export type FilterOperatorGroup = readonly FilterOperator[];

export type FilterParts = {
  column: FilterColumn;
  operator: FilterOperator;
  values: readonly unknown[];
};

type PartsPillContent = { type: "parts"; parts: FilterParts };
type OpaquePillContent = {
  type: "opaque";
  displayName: string;
  icon: IconName;
};
type ExpressionPillContent = { type: "expression"; expression: string };

export type PillContent =
  | PartsPillContent
  | OpaquePillContent
  | ExpressionPillContent;

export type ColumnItem<F> =
  | { type: "column"; column: FilterColumn; targetStage?: number }
  | { type: "filter"; filter: F; label: string; icon: IconName };

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
  operators: (column: FilterColumn) => readonly FilterOperatorGroup[] | null;
  toFilter: (parts: FilterParts) => F | null;
  toPill: (filter: F) => PillContent;
  formatValues: (parts: FilterParts) => string;
  renderFilterEditor?: (props: FilterEditorProps<F>) => ReactNode;
};

export type FilterBarAdapter<F> = {
  stage: (index: number) => FilterBarStageAdapter<F>;
};

export type FilterBarProps<F> = {
  value: FilterStages<F>;
  onChange: (stages: FilterStages<F>) => void;
  adapter: FilterBarAdapter<F>;
  autoFocus?: boolean;
};

export const isLeafTree = <F>(tree: FilterTree<F>): tree is LeafTree<F> =>
  tree.type === "leaf";

export const isPartsPillContent = (
  content: PillContent,
): content is PartsPillContent => content.type === "parts";

export const isOpaquePillContent = (
  content: PillContent,
): content is OpaquePillContent => content.type === "opaque";

export const isExpressionPillContent = (
  content: PillContent,
): content is ExpressionPillContent => content.type === "expression";
