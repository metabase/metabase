import { skipToken } from "@reduxjs/toolkit/query";
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { AdminContentTable } from "metabase/admin/components/AdminContentTable";
import { EmptyState } from "metabase/common/components/EmptyState";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { usePagination } from "metabase/common/hooks/use-pagination";
import Animation from "metabase/css/core/animation.module.css";
import {
  Alert,
  Box,
  Collapse,
  Flex,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { getFullName } from "metabase/utils/user";
import { useGetDataAppUserPermissionWarningsQuery } from "metabase-enterprise/api";
import type { DataAppUserPermissionWarning, Member } from "metabase-types/api";

import { AddDataAppUsers } from "../AddDataAppUsers/AddDataAppUsers";
import { DataAppDataAccessWarning } from "../DataAppDataAccessWarning/DataAppDataAccessWarning";

import S from "./DataAppUserList.module.css";

const PAGE_SIZE = 25;

type Props = {
  appName: string;
  isAdding: boolean;
  members: Member[];
  onAddUsers: (userIds: number[]) => void;
  onCancelAdd: () => void;
  onRemoveUser: (member: Member) => void;
};

export const DataAppUserList = ({
  appName,
  isAdding,
  members,
  onAddUsers,
  onCancelAdd,
  onRemoveUser,
}: Props) => {
  const { handleNextPage, handlePreviousPage, page } = usePagination();

  const visibleMembers = useMemo(
    () => members.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [members, page],
  );

  const visibleMemberIds = useMemo(
    () => visibleMembers.map(({ user_id }) => user_id),
    [visibleMembers],
  );

  const warnings = useDataAppUserWarnings(appName, visibleMemberIds);

  return (
    <Stack data-testid="user-management-sections" gap="lg">
      {warnings.isError && <WarningRequestError />}

      <Box
        className={cx(
          S.userListContent,
          !isAdding && S.transitioningUserListContent,
        )}
      >
        {(isAdding || members.length > 0) && (
          <Box
            data-testid="data-app-users-card"
            bd={members.length > 0 ? "1px solid var(--mb-color-border)" : 0}
            bdrs="md"
            bg="background-primary"
            style={{ overflow: "hidden" }}
          >
            {isAdding && (
              <AddDataAppUsers
                hasCurrentUsers={members.length > 0}
                members={members}
                onAddUsers={onAddUsers}
                onCancel={onCancelAdd}
              />
            )}

            {members.length > 0 && (
              <AdminContentTable
                className={cx(S.userTable, Animation.fadeIn)}
                columnTitles={[]}
              >
                {visibleMembers.map((member) => (
                  <MemberRow
                    key={member.membership_id}
                    member={member}
                    warning={warnings.byUserId.get(member.user_id)}
                    onRemove={onRemoveUser}
                  />
                ))}
              </AdminContentTable>
            )}

            {members.length > PAGE_SIZE && (
              <Flex align="center" justify="flex-end" p="md">
                <PaginationControls
                  page={page}
                  pageSize={PAGE_SIZE}
                  itemsLength={visibleMembers.length}
                  total={members.length}
                  onNextPage={handleNextPage}
                  onPreviousPage={handlePreviousPage}
                />
              </Flex>
            )}
          </Box>
        )}

        <Collapse
          in={members.length === 0}
          transitionDuration={150}
          transitionTimingFunction="ease-out"
        >
          <DataAppUsersEmptyState />
        </Collapse>
      </Box>
    </Stack>
  );
};

const DataAppUsersEmptyState = () => (
  <Box
    data-testid="data-app-users-empty-state"
    bg="background-secondary"
    bdrs="md"
    py="5rem"
  >
    <EmptyState
      title={t`No one has access yet`}
      spacing="sm"
      illustrationElement={
        <img
          src={NoResults}
          alt={t`No results`}
          width={120}
          height={120}
          data-testid="data-app-users-empty-state-icon"
        />
      }
    />
  </Box>
);

const useDataAppUserWarnings = (appName: string, userIds: number[]) => {
  const request = useGetDataAppUserPermissionWarningsQuery(
    userIds.length > 0 ? { name: appName, user_ids: userIds } : skipToken,
  );

  const warningByUserId = useMemo(
    () =>
      new Map(request.data?.map((warning) => [warning.user_id, warning]) ?? []),
    [request.data],
  );

  return {
    byUserId: warningByUserId,
    isError: request.isError,
  };
};

const MemberRow = ({
  member,
  warning,
  onRemove,
}: {
  member: Member;
  warning?: DataAppUserPermissionWarning;
  onRemove: (member: Member) => void;
}) => {
  const name = getFullName(member) ?? member.email;

  return (
    <tr>
      <td>
        <Text fw={700}>{name}</Text>
      </td>

      <td>{member.email}</td>

      <Box component="td" w="1%" style={{ whiteSpace: "nowrap" }}>
        <Flex
          data-testid="data-app-user-actions"
          align="center"
          justify="flex-end"
          gap="lg"
          wrap="nowrap"
          style={{ minWidth: "max-content" }}
        >
          {warning && (
            <DataAppDataAccessWarning
              warning={warning}
              userName={member.first_name || name}
            />
          )}

          <UnstyledButton
            aria-label={t`Remove ${name}`}
            onClick={() => onRemove(member)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="close" c="text-disabled" size={16} />
          </UnstyledButton>
        </Flex>
      </Box>
    </tr>
  );
};

const WarningRequestError = () => (
  <Alert color="warning" icon={<Icon name="warning" />}>
    {t`We couldn't check data access for some users. You can still update access to this data app.`}
  </Alert>
);
