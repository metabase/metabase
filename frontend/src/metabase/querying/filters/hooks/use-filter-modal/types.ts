import type { Dispatch, SetStateAction } from "react";

import type * as Lib from "metabase-lib";

import type { GroupItem } from "../../types";

export type FilterModalResult = {
  query: Lib.Query;
  version: number;
  isChanged: boolean;
  groupItems: GroupItem[];
  tab: string | null;
  setTab: Dispatch<SetStateAction<string | null>>;
  canRemoveFilters: boolean;
  searchText: string;
  isSearching: boolean;
  visibleItems: GroupItem[];
  handleInput: () => void;
  handleChange: (query: Lib.Query) => void;
  handleReset: () => void;
  handleSubmit: () => void;
  handleSearch: (searchText: string) => void;
};
