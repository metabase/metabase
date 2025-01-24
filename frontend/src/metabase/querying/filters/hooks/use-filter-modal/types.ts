import type { Dispatch, SetStateAction } from "react";

import type * as Lib from "metabase-lib";

import type { GroupItem } from "../../types";

export type FilterModalResult = {
  canRemoveFilters: boolean;
  groupItems: GroupItem[];
  isChanged: boolean;
  isSearching: boolean;
  query: Lib.Query;
  searchText: string;
  setTab: Dispatch<SetStateAction<string | null>>;
  tab: string | null;
  version: number;
  visibleItems: GroupItem[];
  handleChange: (query: Lib.Query) => void;
  handleInput: () => void;
  handleReset: () => void;
  handleSearch: (searchText: string) => void;
  handleSubmit: () => void;
};
