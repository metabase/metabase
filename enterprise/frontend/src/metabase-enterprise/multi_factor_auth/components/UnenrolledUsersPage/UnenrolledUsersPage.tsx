import { useMemo } from "react";
import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import { useListUnenrolledMfaUsersQuery } from "metabase-enterprise/api";
import type { MfaAdminUser } from "metabase-types/api";

import {
  MfaUsersPage,
  getEmailColumn,
  getNameColumn,
  useMfaUsersQuery,
} from "../MfaUsersPage";

function getColumns(): TreeTableColumnDef<MfaAdminUser>[] {
  return [getNameColumn(), getEmailColumn()];
}

export const UnenrolledUsersPage = () => {
  const { params, listProps, debouncedSearch } = useMfaUsersQuery();
  const { data, isLoading, error } = useListUnenrolledMfaUsersQuery(params);

  const columns = useMemo(() => getColumns(), []);

  const emptyMessage = useMemo(
    () =>
      data?.data.length === 0 && !debouncedSearch && !isLoading
        ? t`No unenrolled users`
        : t`No results found`,
    [data, debouncedSearch, isLoading],
  );

  return (
    <MfaUsersPage
      {...listProps}
      emptyMessage={emptyMessage}
      title={t`Users without 2FA`}
      tableAriaLabel={t`Users without two-factor authentication`}
      testId="mfa-unenrolled-users-table"
      columns={columns}
      response={data}
      isLoading={isLoading}
      error={error}
    />
  );
};
