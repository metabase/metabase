import { useMemo, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { ActionIcon, Icon, Menu, type TreeTableColumnDef } from "metabase/ui";
import { useListEnrolledMfaUsersQuery } from "metabase-enterprise/api";
import type { MfaEnrolledUser, UserId } from "metabase-types/api";

import {
  MfaUsersPage,
  getEmailColumn,
  getNameColumn,
  useMfaUsersQuery,
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
  const [userToRemove, setUserToRemove] = useState<MfaEnrolledUser | null>(
    null,
  );
  const { params, listProps, debouncedSearch } = useMfaUsersQuery();
  const { data, isLoading, error } = useListEnrolledMfaUsersQuery(params);

  const columns = useMemo(
    () =>
      getColumns({ currentUserId: currentUser?.id, onRemove: setUserToRemove }),
    [currentUser?.id],
  );

  const emptyMessage = useMemo(
    () =>
      data?.data.length === 0 && !debouncedSearch && !isLoading
        ? t`No enrolled users`
        : t`No results found`,
    [data, debouncedSearch, isLoading],
  );

  return (
    <>
      <MfaUsersPage
        {...listProps}
        emptyMessage={emptyMessage}
        title={t`Enrolled Users`}
        tableAriaLabel={t`Users with two-factor authentication`}
        testId="mfa-enrolled-users-table"
        columns={columns}
        response={data}
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
