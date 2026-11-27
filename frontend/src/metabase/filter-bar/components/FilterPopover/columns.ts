import type { BoolOpToken } from "../../model";
import type { ColumnGroup, ColumnItem } from "../../types";
import type { DraftPick } from "../FilterBar/draft-suggestion";
import { findExact, isMatch } from "../SuggestionList/search";
import type {
  SuggestionGroup,
  SuggestionItem,
  SuggestionLabel,
  SuggestionRow,
} from "../SuggestionList/utils";

export const getItemDisplay = <F>(item: ColumnItem<F>) =>
  item.type === "column" ? item.column : item;

const toItemRow = <F>(
  key: string,
  item: ColumnItem<F>,
): SuggestionItem<DraftPick<F>> => {
  const { label, icon } = getItemDisplay(item);
  return { type: "item", key, label, icon, value: item };
};

const toColumnGroup = <F>(
  group: ColumnGroup<F>,
  query: string,
): SuggestionGroup<DraftPick<F>>[] => {
  const key = `group:${group.label}`;
  const rows = group.sections.flatMap(
    (section, sectionIndex): SuggestionRow<DraftPick<F>>[] => {
      const sectionKey = `${key}:${sectionIndex}`;
      const items = section.items.flatMap((item, itemIndex) =>
        isMatch(getItemDisplay(item).label, query)
          ? [toItemRow(`${sectionKey}:${itemIndex}`, item)]
          : [],
      );
      const labels: SuggestionLabel[] = section.label
        ? [{ type: "label", key: sectionKey, label: section.label }]
        : [];
      return items.length > 0 ? [...labels, ...items] : [];
    },
  );
  const header = { label: group.label, icon: group.icon };
  return rows.length > 0 ? [{ key, header, rows }] : [];
};

const toBoolOpGroup = <F>(
  boolOp: BoolOpToken["type"],
): SuggestionGroup<DraftPick<F>> => ({
  key: "bool-op",
  rows: [
    {
      type: "item",
      key: `bool-op:${boolOp}`,
      label: boolOp.toUpperCase(),
      value: { type: "boolOp", boolOp },
    },
  ],
});

export const getColumnSuggestions = <F>(
  groups: readonly ColumnGroup<F>[],
  query: string,
  boolOp: BoolOpToken["type"] | null,
): SuggestionGroup<DraftPick<F>>[] => [
  ...(boolOp ? [toBoolOpGroup<F>(boolOp)] : []),
  ...groups.flatMap((group) => toColumnGroup(group, query)),
];

export const findExactColumn = <F>(
  groups: readonly ColumnGroup<F>[],
  query: string,
) =>
  findExact(
    groups.flatMap((group) => group.sections.flatMap(({ items }) => items)),
    (item) => getItemDisplay(item).label,
    query,
  );
