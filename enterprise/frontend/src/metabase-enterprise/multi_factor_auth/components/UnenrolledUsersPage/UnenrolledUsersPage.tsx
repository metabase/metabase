import { useMemo, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { usePagination } from "metabase/common/hooks/use-pagination";
import type { TreeTableColumnDef } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { useListUnenrolledMfaUsersQuery } from "metabase-enterprise/api";
import type { MfaAdminUser } from "metabase-types/api";

import {
  MfaUsersPage,
  PAGE_SIZE,
  getEmailColumn,
  getNameColumn,
} from "../MfaUsersPage";

function getColumns(): TreeTableColumnDef<MfaAdminUser>[] {
  return [getNameColumn(), getEmailColumn()];
}

export const UnenrolledUsersPage = () => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const { page, handleNextPage, handlePreviousPage, resetPage } =
    usePagination();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    resetPage();
  };

  const { data, isLoading, error } = useListUnenrolledMfaUsersQuery({
    query: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  });

  const columns = useMemo(() => getColumns(), []);

  return (
    <MfaUsersPage
      title={t`Users without 2FA`}
      emptyMessage={t`No results found`}
      tableAriaLabel={t`Users without two-factor authentication`}
      testId="mfa-unenrolled-users-table"
      columns={columns}
      users={data?.data ?? []}
      searchValue={search}
      onSearchChange={handleSearchChange}
      page={page}
      total={data?.total ?? 0}
      onNextPage={handleNextPage}
      onPreviousPage={handlePreviousPage}
      isLoading={isLoading}
      error={error}
    />
  );
};
