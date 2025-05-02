import cx from "classnames";
import { Fragment, useEffect } from "react";
import { usePrevious } from "react-use";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  useCreateMembershipMutation,
  useDeleteMembershipMutation,
  useListUserMembershipsQuery,
  useUpdateMembershipMutation,
} from "metabase/api";
import { PaginationControls } from "metabase/components/PaginationControls";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import Users from "metabase/entities/users";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { Box, Flex, Icon, Text } from "metabase/ui";
import type {
  GroupId,
  Group as IGroup,
  Member,
  User,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { USER_STATUS } from "../constants";

import { PeopleListRow } from "./PeopleListRow";

interface PeopleListQueryProps {
  query: {
    searchText: string;
    status: string;
    page: number;
    pageSize: number;
  };
}

interface PeopleListProps extends PeopleListQueryProps {
  membershipsByUser: Record<User["id"], Member[]>;
  currentUser: User;
  users: User[];
  groups: IGroup[];
  isAdmin: boolean;
  createMembership: (membership: {
    groupId: GroupId;
    userId: User["id"];
  }) => void | Promise<void>;
  onNextPage?: () => void;
  onPreviousPage: () => void;
  reloadUsers: () => void;
  reloadGroups: () => void;
  metadata: {
    total: number;
  };
}

const PeopleListInner = ({
  users,
  isAdmin,
  currentUser,
  groups,
  query,
  metadata,
  reloadUsers,
  reloadGroups,
  onNextPage,
  onPreviousPage,
}: PeopleListProps) => {
  const { modalContent, show } = useConfirmation();
  const prevUsers = usePrevious(users);

  const dispatch = useDispatch();

  const [createMembership] = useCreateMembershipMutation();
  const [updateMembership] = useUpdateMembershipMutation();
  const [deleteMembership] = useDeleteMembershipMutation();

  const { data: membershipsByUser = {} } = useListUserMembershipsQuery();

  useEffect(() => {
    if (!prevUsers) {
      return;
    }

    const areSameUsers = _.isEqual(
      prevUsers.map((u) => u.id),
      users.map((u) => u.id),
    );

    if (!areSameUsers) {
      return;
    }

    const isActivityChanged = !_.isEqual(
      prevUsers.map((u) => u.is_active),
      users.map((u) => u.is_active),
    );

    if (isActivityChanged) {
      reloadUsers();
    }
  }, [prevUsers, reloadUsers, users]);

  const { total } = metadata;

  const { page, pageSize, status } = query;

  const isCurrentUser = (u: User) => currentUser?.id === u.id;
  const showDeactivated = status === USER_STATUS.deactivated;
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
          reloadGroups();
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
          reloadGroups();
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
    <Box component="section" pb="xl">
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
                <th>{t`Deactivated`}</th>
                <th />
              </Fragment>
            ) : (
              <Fragment>
                <th>{t`Groups`}</th>
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
                onRemove={(groupId: GroupId) => handleRemove(groupId, user.id)}
                onChange={(groupId: GroupId, membershipData: Partial<Member>) =>
                  handleChange(groupId, membershipData, user.id)
                }
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
          p="xl"
          ta="center"
        >
          <Box my="lg">
            <Icon name="search" mb="sm" size={32} />
            <Text c="text-light" fz="lg" fw={700}>{t`No results found`}</Text>
          </Box>
        </Flex>
      )}

      {modalContent}
    </Box>
  );
};

export const PeopleList = _.compose(
  Users.loadList({
    reload: true,
    query: (_state: State, { query }: PeopleListQueryProps) => ({
      query: query.searchText,
      status: query.status,
      limit: query.pageSize,
      offset: query.pageSize * query.page,
    }),
  }),
)(PeopleListInner);
