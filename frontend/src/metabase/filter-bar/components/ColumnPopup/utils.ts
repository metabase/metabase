import type { ColumnGroup, ColumnItem } from "../../types";
import { findExact, isMatch } from "../SuggestionMenu/search";

export type ListRow<F> =
  | { type: "group"; key: string; group: ColumnGroup<F>; isCollapsed: boolean }
  | { type: "section"; key: string; label: string }
  | { type: "item"; key: string; item: ColumnItem<F> };

type ItemRow<F> = Extract<ListRow<F>, { type: "item" }>;

export const getItemDisplay = <F>(item: ColumnItem<F>) =>
  item.type === "column" ? item.column : item;

export const buildList = <F>(
  groups: readonly ColumnGroup<F>[],
  query: string,
  collapsedKeys: ReadonlySet<string>,
): ListRow<F>[] => {
  const isSearching = query.trim() !== "";
  return groups.flatMap((group) => {
    const key = group.label;
    const sections = group.sections.flatMap((section, sectionIndex) => {
      const sectionKey = `${key}:${sectionIndex}`;
      const items = section.items.flatMap((item, itemIndex): ItemRow<F>[] =>
        isMatch(getItemDisplay(item).label, query)
          ? [{ type: "item", key: `${sectionKey}:${itemIndex}`, item }]
          : [],
      );
      const header: ListRow<F>[] = section.label
        ? [{ type: "section", key: sectionKey, label: section.label }]
        : [];
      return items.length > 0 ? [...header, ...items] : [];
    });
    if (sections.length === 0) {
      return [];
    }
    const isCollapsed = !isSearching && collapsedKeys.has(key);
    const header: ListRow<F> = { type: "group", key, group, isCollapsed };
    return isCollapsed ? [header] : [header, ...sections];
  });
};

export const splitByGroup = <F>(rows: readonly ListRow<F>[]) => {
  const starts = rows.flatMap((row, index) =>
    row.type === "group" ? [index] : [],
  );
  return starts.map((start, order) => {
    const header = rows[start];
    return {
      start,
      rows: rows.slice(start, starts[order + 1]),
      isCollapsed: header.type === "group" && header.isCollapsed,
    };
  });
};

const isNavigableRow = <F>(row: ListRow<F>) => row.type !== "section";

export const getFirstItemIndex = <F>(rows: readonly ListRow<F>[]) =>
  rows.findIndex((row) => row.type === "item");

export const getNextIndex = <F>(
  rows: readonly ListRow<F>[],
  index: number,
  step: 1 | -1,
) => {
  const count = rows.length;
  const candidates = rows.map(
    (_, offset) => (((index + step * (offset + 1)) % count) + count) % count,
  );
  return candidates.find((next) => isNavigableRow(rows[next])) ?? index;
};

export const findExactItem = <F>(rows: readonly ListRow<F>[], query: string) =>
  findExact(
    rows.flatMap((row) => (row.type === "item" ? [row.item] : [])),
    (item) => getItemDisplay(item).label,
    query,
  );
