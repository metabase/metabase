import type * as Lib from "metabase-lib";

import type { GroupItem } from "../../types";

export type FilterModalResult = {
  canRemoveFilters: boolean;
  groupItems: GroupItem[];
  isChanged: boolean;
  isSearching: boolean;
  query: Lib.Query;
  remountKey: number;
  searchText: string;
  tab: string | null;
  visibleItems: GroupItem[];
  onInput: () => void;
  onQueryChange: (query: Lib.Query) => void;
  onReset: () => void;
  onSearchTextChange: (searchText: string) => void;
  onSubmit: () => void;
  onTabChange: (tab: string | null) => void;
};
