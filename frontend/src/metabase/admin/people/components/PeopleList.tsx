import cx from "classnames";
import { Fragment } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  useCreateMembershipMutation,
  useDeleteMembershipMutation,
  useListUserMembershipsQuery,
  useListUsersQuery,
  useUpdateMembershipMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { Box, Flex, Icon, Text } from "metabase/ui";
import type {
  GroupId,
  GroupInfo,
  Member,
  User,
  UserTenancy,
} from "metabase-types/api";

import { ACTIVE_STATUS, type ActiveStatus } from "../constants";

import { PeopleListRow } from "./PeopleListRow";

const defaultUsersValue: User[] = [];

interface PeopleListQueryProps {
  query: {
    searchText: string;
    status: ActiveStatus;
    page: number;
    pageSize: number;
    tenancy: UserTenancy;
  };
}

interface PeopleListProps extends PeopleListQueryProps {
  currentUser: User;
  groups: GroupInfo[];
  isAdmin: boolean;
  onNextPage?: () => void;
  onPreviousPage: () => void;
  external?: boolean;
  noResultsMessage: string;
}

export const PeopleList = ({
  isAdmin,
  currentUser,
  groups,
  query,
  onNextPage,
  onPreviousPage,
  external = false,
  noResultsMessage,
}: PeopleListProps) => {
  const { modalContent, show } = useConfirmation();

  const { data, isLoading, error } = useListUsersQuery({
    query: query.searchText,
    status: query.status === "active" ? undefined : query.status,
    limit: query.pageSize,
    offset: query.pageSize * query.page,
    tenancy: query.tenancy,
  });

  const users = data?.data || defaultUsersValue;

  const total = data?.total ?? 0;

  const dispatch = useDispatch();

  const [createMembership] = useCreateMembershipMutation();
  const [updateMembership] = useUpdateMembershipMutation();
  const [deleteMembership] = useDeleteMembershipMutation();

  const { data: membershipsByUser = {} } = useListUserMembershipsQuery();

  const { page, pageSize, status } = query;

  const isCurrentUser = (u: User) => currentUser.id === u.id;
  const showDeactivated = status === ACTIVE_STATUS.deactivated;
  const hasUsers = users.length > 0;

  const handleChange = async (
    groupId: GroupId,
    membershipData: Partial<Member>,
    userId: User["id"],
  ) => {
    const membership = membershipsByUser[userId].find(
      (membership) => membership.group_id === groupId,
    );

    if (!membership) {
      console.error("Tried to update a membership that does not exist");
      return;
    }

    const updatedMembership = {
      ...membership,
      ...membershipData,
    };

    const confirmation = PLUGIN_GROUP_MANAGERS.getChangeMembershipConfirmation(
      currentUser,
      updatedMembership,
    );

    if (confirmation) {
      show({
        ...confirmation,
        onConfirm: async () => {
          await dispatch(
            PLUGIN_GROUP_MANAGERS.confirmUpdateMembershipAction(
              updatedMembership,
              membershipsByUser[currentUser.id],
              "people",
            ),
          );
        },
      });
    } else {
      await updateMembership(updatedMembership).unwrap();
    }
  };

  const handleRemove = async (groupId: GroupId, userId: User["id"]) => {
    const membership = membershipsByUser[userId].find(
      (membership) => membership.group_id === groupId,
    );

    if (!membership) {
      console.error("Tried to remove a membership that does not exist");
      return;
    }

    const confirmation = PLUGIN_GROUP_MANAGERS.getRemoveMembershipConfirmation(
      currentUser,
      membershipsByUser[currentUser.id],
      membership.membership_id,
    );

    if (confirmation) {
      show({
        ...confirmation,
        onConfirm: async () => {
          await dispatch(
            PLUGIN_GROUP_MANAGERS.confirmDeleteMembershipAction(
              membership,
              membershipsByUser[currentUser.id],
              "people",
            ),
          );
        },
      });
    } else {
      return await deleteMembership(membership).unwrap();
    }
  };

  const handleAdd = (groupId: GroupId, userId: User["id"]) => {
    return createMembership({ group_id: groupId, user_id: userId }).unwrap();
  };

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      <Box component="section">
        <table
          data-testid="admin-people-list-table"
          className={cx(AdminS.ContentTable, CS.borderBottom)}
        >
          <thead>
            <tr>
              <th>{t`Name`}</th>
              <th />
              <th>{t`Email`}</th>
              {showDeactivated ? (
                <Fragment>
                  {external && <th>{t`Tenant`}</th>}
                  <th>{t`Deactivated`}</th>
                  <th />
                </Fragment>
              ) : (
                <Fragment>
                  {external ? <th>{t`Tenant`}</th> : <th>{t`Groups`}</th>}
                  <th>{t`Last Login`}</th>
                  <th />
                </Fragment>
              )}
            </tr>
          </thead>
          <tbody>
            {hasUsers &&
              users.map((user) => (
                <PeopleListRow
                  key={user.id}
                  user={user}
                  showDeactivated={showDeactivated}
                  groups={groups}
                  userMemberships={membershipsByUser[user.id]}
                  isCurrentUser={isCurrentUser(user)}
                  isAdmin={isAdmin}
                  onAdd={(groupId: GroupId) => handleAdd(groupId, user.id)}
                  onRemove={(groupId: GroupId) =>
                    handleRemove(groupId, user.id)
                  }
                  onChange={(
                    groupId: GroupId,
                    membershipData: Partial<Member>,
                  ) => handleChange(groupId, membershipData, user.id)}
                  isConfirmModalOpen={Boolean(modalContent)}
                />
              ))}
          </tbody>
        </table>

        {hasUsers && (
          <Flex
            align="center"
            justify="space-between"
            p="md"
            data-testid="people-list-footer"
          >
            <Box fw={700}>
              {ngettext(
                msgid`${total} person found`,
                `${total} people found`,
                total,
              )}
            </Box>
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={total}
              itemsLength={users.length}
              onNextPage={onNextPage}
              onPreviousPage={onPreviousPage}
            />
          </Flex>
        )}

        {!hasUsers && (
          <Flex
            align="center"
            justify="center"
            direction="column"
            px="xl"
            pt="xl"
            ta="center"
          >
            <Box my="lg">
              <Icon name="search" mb="sm" size={32} />
              <Text c="text-tertiary" fz="lg" fw={700}>
                {noResultsMessage}
              </Text>
            </Box>
          </Flex>
        )}

        {modalContent}
      </Box>
    </LoadingAndErrorWrapper>
  );
};
