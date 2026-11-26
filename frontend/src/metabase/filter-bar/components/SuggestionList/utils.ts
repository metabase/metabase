import type { IconName } from "metabase-types/api";

export type SuggestionItem<T> = {
  type: "item";
  key: string;
  label: string;
  icon?: IconName;
  hint?: string;
  value: T;
};

export type SuggestionLabel = { type: "label"; key: string; label: string };

export type SuggestionRow<T> = SuggestionItem<T> | SuggestionLabel;

export type SuggestionGroup<T> = {
  key: string;
  header?: { label: string; icon: IconName };
  rows: readonly SuggestionRow<T>[];
};

export type VisibleGroup<T> = SuggestionGroup<T> & { isCollapsed: boolean };

export type SuggestionOption<T> =
  | { type: "header"; key: string }
  | SuggestionItem<T>;

const isItem = <T>(row: SuggestionRow<T>): row is SuggestionItem<T> =>
  row.type === "item";

export const getVisibleGroups = <T>(
  groups: readonly SuggestionGroup<T>[],
  collapsedKeys: ReadonlySet<string>,
  query: string,
): VisibleGroup<T>[] => {
  const isSearching = query.trim() !== "";
  return groups.map((group) => {
    const isCollapsed =
      Boolean(group.header) && !isSearching && collapsedKeys.has(group.key);
    return { ...group, isCollapsed, rows: isCollapsed ? [] : group.rows };
  });
};

const getHeaderOptions = <T>(group: VisibleGroup<T>): SuggestionOption<T>[] =>
  group.header ? [{ type: "header", key: group.key }] : [];

export const getOptions = <T>(
  groups: readonly VisibleGroup<T>[],
): SuggestionOption<T>[] =>
  groups.flatMap((group) => [
    ...getHeaderOptions(group),
    ...group.rows.filter(isItem),
  ]);
