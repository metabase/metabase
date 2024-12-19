import { useMemo, useRef, useState } from "react";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { getGroupItems, hasFilters, removeFilters } from "../../utils";

import { SEARCH_KEY } from "./constants";
import { isSearchActive, searchGroupItems } from "./utils";

export const useFilterModal = (
  question: Question,
  onSubmit: (newQuery: Lib.Query) => void,
) => {
  const [query, setQuery] = useState(() =>
    // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations
    question.display() === "pivot"
      ? question.query()
      : Lib.ensureFilterStage(question.query()),
  );
  const queryRef = useRef(query);
  const [version, setVersion] = useState(1);
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

  const handleInput = () => {
    if (!isChanged) {
      setIsChanged(true);
    }
  };

  const handleChange = (newQuery: Lib.Query) => {
    setQuery(newQuery);
    setIsChanged(true);
    // for handleSubmit to see the latest query if it is called in the same tick
    queryRef.current = newQuery;
  };

  const handleReset = () => {
    handleChange(removeFilters(query));
    // to reset internal state of filter components
    setVersion(version + 1);
  };

  const handleSubmit = () => {
    onSubmit(Lib.dropEmptyStages(queryRef.current));
  };

  const handleSearch = (searchText: string) => {
    setTab(isSearchActive(searchText) ? SEARCH_KEY : groupItems[0]?.key);
    setSearchText(searchText);
  };

  return {
    query,
    version,
    isChanged,
    groupItems,
    tab,
    setTab,
    canRemoveFilters,
    searchText,
    isSearching,
    visibleItems,
    handleInput,
    handleChange,
    handleReset,
    handleSubmit,
    handleSearch,
  };
};
