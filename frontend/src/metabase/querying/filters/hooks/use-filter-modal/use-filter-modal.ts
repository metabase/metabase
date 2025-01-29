import { useMemo, useRef, useState } from "react";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { SEARCH_KEY } from "./constants";
import type { FilterModalResult } from "./types";
import { getGroupItems, hasFilters, removeFilters } from "./utils/filters";
import { isSearchActive, searchGroupItems } from "./utils/search";

export const useFilterModal = (
  question: Question,
  onSubmitProp: (newQuery: Lib.Query) => void,
): FilterModalResult => {
  const [query, setQuery] = useState(() =>
    // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations
    question.display() === "pivot"
      ? question.query()
      : Lib.ensureFilterStage(question.query()),
  );
  const queryRef = useRef(query);
  /**
   * Used to re-initialize the state of descendant components and their hooks.
   * Kicks in when changing search query or clearing all filters.
   *
   * @see https://github.com/metabase/metabase/issues/48319
   */
  const [remountKey, setRemountKey] = useState(1);
  const [isChanged, setIsChanged] = useState(false);
  const groupItems = useMemo(() => getGroupItems(query), [query]);
  const [tab, setTab] = useState<string | null>(groupItems[0]?.key);
  const canRemoveFilters = useMemo(() => hasFilters(query), [query]);
  const [searchText, setSearchText] = useState("");
  const isSearching = isSearchActive(searchText);

  const visibleItems = useMemo(
    () => (isSearching ? searchGroupItems(groupItems, searchText) : groupItems),
    [groupItems, searchText, isSearching],
  );

  const forceRemountDescendants = () => {
    setRemountKey(remountKey => remountKey + 1);
  };

  const onInput = () => {
    if (!isChanged) {
      setIsChanged(true);
    }
  };

  const onQueryChange = (newQuery: Lib.Query) => {
    setQuery(newQuery);
    setIsChanged(true);
    // for handleSubmit to see the latest query if it is called in the same tick
    queryRef.current = newQuery;
  };

  const onReset = () => {
    onQueryChange(removeFilters(query));
    forceRemountDescendants();
  };

  const onSubmit = () => {
    onSubmitProp(Lib.dropEmptyStages(queryRef.current));
  };

  const onSearchTextChange = (searchText: string) => {
    setTab(isSearchActive(searchText) ? SEARCH_KEY : groupItems[0]?.key);
    setSearchText(searchText);
    forceRemountDescendants();
  };

  return {
    canRemoveFilters,
    groupItems,
    isChanged,
    isSearching,
    query,
    remountKey,
    searchText,
    tab,
    visibleItems,
    onInput,
    onQueryChange,
    onReset,
    onSearchTextChange,
    onSubmit,
    onTabChange: setTab,
  };
};
