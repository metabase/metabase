import { useState } from "react";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { MfaAdminUser, MfaUserListRequest } from "metabase-types/api";

import { type MfaUsersPageProps, PAGE_SIZE } from "./MfaUsersPage";

type MfaUsersListProps = Pick<
  MfaUsersPageProps<MfaAdminUser>,
  "searchValue" | "onSearchChange" | "page" | "onNextPage" | "onPreviousPage"
>;

export function useMfaUsersQuery(): {
  params: MfaUserListRequest;
  listProps: MfaUsersListProps;
  debouncedSearch: string;
} {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const { page, handleNextPage, handlePreviousPage, resetPage } =
    usePagination();

  // reset on every keystroke rather than on the debounced edge, so no request
  // can pair a new query with a stale offset
  const handleSearchChange = (value: string) => {
    setSearch(value);
    resetPage();
  };

  return {
    params: {
      query: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset: PAGE_SIZE * page,
    },
    listProps: {
      searchValue: search,
      onSearchChange: handleSearchChange,
      page,
      onNextPage: handleNextPage,
      onPreviousPage: handlePreviousPage,
    },
    debouncedSearch,
  };
}
