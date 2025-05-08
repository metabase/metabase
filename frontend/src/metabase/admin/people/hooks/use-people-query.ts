import { useEffect, useMemo, useState } from "react";

import { usePagination } from "metabase/hooks/use-pagination";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

import { USER_STATUS, type UserStatus } from "../constants";

const MIN_SEARCH_LENGTH = 2;

// NOTE: EntityListLoader uses usePaginatedQuery hook, however,
// it is not the best place to store pagination state since we might want to
// change it from the ancestors, for instance, when we change list filter props.
// If users change any filters, we should reset the page state.
export const usePeopleQuery = (pageSize: number) => {
  const { handleNextPage, handlePreviousPage, setPage, page } = usePagination();

  const [status, setStatus] = useState<UserStatus>(USER_STATUS.active);
  const [searchInputValue, setSearchInputValue] = useState("");

  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const timerId = setTimeout(() => {
      const searchText =
        searchInputValue.length >= MIN_SEARCH_LENGTH ? searchInputValue : "";

      setPage(0);
      setSearchText(searchText);
    }, SEARCH_DEBOUNCE_DURATION);

    return () => clearTimeout(timerId);
  }, [searchInputValue, setPage]);

  const updateStatus = (status: UserStatus) => {
    setPage(0);
    setStatus(status);
  };

  const query = useMemo(
    () => ({
      status,
      searchText,
      page,
      pageSize,
    }),
    [status, searchText, page, pageSize],
  );

  return {
    query,
    status,
    searchInputValue,
    updateSearchInputValue: setSearchInputValue,
    updateStatus,
    handleNextPage,
    handlePreviousPage,
  };
};
