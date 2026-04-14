import { useDebouncedValue } from "@mantine/hooks";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import { usePagination } from "metabase/common/hooks/use-pagination";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { UserTenancy } from "metabase-types/api";

import { ACTIVE_STATUS, type ActiveStatus } from "../constants";

const MIN_SEARCH_LENGTH = 2;

// NOTE: EntityListLoader uses usePaginatedQuery hook, however,
// it is not the best place to store pagination state since we might want to
// change it from the ancestors, for instance, when we change list filter props.
// If users change any filters, we should reset the page state.
export const usePeopleQuery = (pageSize: number, tenancy: UserTenancy) => {
  const { handleNextPage, handlePreviousPage, setPage, page } = usePagination();

  const [status, setStatus] = useState<ActiveStatus>(ACTIVE_STATUS.active);
  const [searchInputValue, setSearchInputValue] = useState("");

  const [searchText] = useDebouncedValue(
    searchInputValue.length >= MIN_SEARCH_LENGTH ? searchInputValue : "",
    SEARCH_DEBOUNCE_DURATION,
  );

  useLayoutEffect(() => {
    setPage(0);
  }, [searchText, setPage]);

  const updateStatus = useCallback(
    (status: ActiveStatus) => {
      setPage(0);
      setStatus(status);
    },
    [setPage],
  );

  const query = useMemo(
    () => ({
      status,
      searchText,
      page,
      pageSize,
      tenancy,
    }),
    [status, searchText, page, pageSize, tenancy],
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
