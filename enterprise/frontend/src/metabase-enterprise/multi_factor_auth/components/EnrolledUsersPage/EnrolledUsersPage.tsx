import { useMemo, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { ActionIcon, Icon, Menu, type TreeTableColumnDef } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { useListEnrolledMfaUsersQuery } from "metabase-enterprise/api";
import type { MfaEnrolledUser, UserId } from "metabase-types/api";

import {
  MfaUsersPage,
  PAGE_SIZE,
  getEmailColumn,
  getNameColumn,
} from "../MfaUsersPage";

import { RemoveMfaModal } from "./RemoveMfaModal";

function getColumns({
  currentUserId,
  onRemove,
}: {
  currentUserId: UserId | undefined;
  onRemove: (user: MfaEnrolledUser) => void;
}): TreeTableColumnDef<MfaEnrolledUser>[] {
  return [
    getNameColumn(),
    getEmailColumn(),

    {
      id: "actions",
      header: "",
      width: 64,
      cell: ({ row }) => {
        const user = row.original;
        if (user.id === currentUserId) {
          return null;
        }
        return (
          <Menu shadow="md" position="bottom-end">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                aria-label={t`Actions for ${user.common_name}`}
                onClick={(event) => event.stopPropagation()}
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
              <Menu.Item
                c="feedback-negative"
                leftSection={<Icon name="lock" />}
                onClick={() => onRemove(user)}
              >
                {t`Remove two-factor authentication`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        );
      },
    },
  ];
}

export const EnrolledUsersPage = () => {
  const currentUser = useSelector(getUser);
  const [search, setSearch] = useState("");
  const [userToRemove, setUserToRemove] = useState<MfaEnrolledUser | null>(
    null,
  );
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const { page, handleNextPage, handlePreviousPage, resetPage } =
    usePagination();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    resetPage();
  };

  const { data, isLoading, error } = useListEnrolledMfaUsersQuery({
    query: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  });

  const columns = useMemo(
    () =>
      getColumns({ currentUserId: currentUser?.id, onRemove: setUserToRemove }),
    [currentUser?.id],
  );

  return (
    <>
      <MfaUsersPage
        title={t`Enrolled Users`}
        emptyMessage={t`No results found`}
        tableAriaLabel={t`Users with two-factor authentication`}
        testId="mfa-enrolled-users-table"
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

      {userToRemove && (
        <RemoveMfaModal
          user={userToRemove}
          onClose={() => setUserToRemove(null)}
        />
      )}
    </>
  );
};
