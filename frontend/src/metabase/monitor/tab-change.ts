import type { SortDirection } from "metabase-types/api";

export type TabSortConfig<TTab extends string, TColumn extends string> = {
  tabSortColumns: Record<TTab, readonly TColumn[]>;
  defaultSortColumn: TColumn;
  defaultSortDirection: SortDirection;
};

type TabChange<TTab extends string, TColumn extends string> = {
  tab: TTab;
  page: number;
  sort_column?: TColumn;
  sort_direction?: SortDirection;
};

export const getTabChange = <
  TTab extends string,
  TColumn extends string,
  TState extends { sort_column: TColumn },
>(
  state: TState,
  tab: TTab,
  {
    tabSortColumns,
    defaultSortColumn,
    defaultSortDirection,
  }: TabSortConfig<TTab, TColumn>,
): TabChange<TTab, TColumn> =>
  tabSortColumns[tab].includes(state.sort_column)
    ? { tab, page: 0 }
    : {
        tab,
        page: 0,
        sort_column: defaultSortColumn,
        sort_direction: defaultSortDirection,
      };
