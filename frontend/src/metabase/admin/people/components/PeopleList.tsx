import cx from "classnames";
import { Fragment, useEffect } from "react";
import { usePrevious } from "react-use";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { PaginationControls } from "metabase/components/PaginationControls";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import Group from "metabase/entities/groups";
import Users from "metabase/entities/users";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { connect } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import type {
  GroupId,
  Group as IGroup,
  Member,
  User,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { USER_STATUS } from "../constants";
import {
  createMembership,
  deleteMembership,
  loadMemberships,
  updateMembership,
} from "../people";
import { getMembershipsByUser } from "../selectors";

import { PeopleListRow } from "./PeopleListRow";

const mapStateToProps = (state: State) => ({
  currentUser: getUser(state),
  isAdmin: getUserIsAdmin(state),
  groups: Group.selectors.getList(state),
  membershipsByUser: getMembershipsByUser(state),
});

const mapDispatchToProps = {
  createMembership,
  deleteMembership,
  updateMembership,
  loadMemberships,
  confirmDeleteMembershipAction: async (
    membershipId: number,
    userMemberships: Member[],
    view: string,
  ) =>
    PLUGIN_GROUP_MANAGERS.confirmDeleteMembershipAction(
      membershipId,
      userMemberships,
      view,
    ),
  confirmUpdateMembershipAction: async (
    membership: Member,
    userMemberships: Member[],
    view: string,
  ) =>
    PLUGIN_GROUP_MANAGERS.confirmUpdateMembershipAction(
      membership,
      userMemberships,
      view,
    ),
};

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
  loadMemberships: () => void;
  createMembership: (membership: {
    groupId: GroupId;
    userId: User["id"];
  }) => void | Promise<void>;
  deleteMembership: (membershipId: number) => void | Promise<void>;
  updateMembership: (membership: Member) => void | Promise<void>;
  confirmDeleteMembershipAction: (
    membershipId: number,
    userMemberships: Member[],
    view: string,
  ) => Promise<void>;
  confirmUpdateMembershipAction: (
    membership: Member,
    userMemberships: Member[],
    view: string,
  ) => Promise<void>;
  onNextPage?: () => void;
  onPreviousPage: () => void;
  reloadUsers: () => void;
  reloadGroups: () => void;
  metadata: {
    total: number;
  };
}

const PeopleListInner = ({
  currentUser,
  users,
  groups,
  query,
  metadata,
  membershipsByUser,
  isAdmin,
  loadMemberships,
  createMembership,
  deleteMembership,
  updateMembership,
  confirmDeleteMembershipAction,
  confirmUpdateMembershipAction,
  reloadUsers,
  reloadGroups,
  onNextPage,
  onPreviousPage,
}: PeopleListProps) => {
  const { modalContent, show } = useConfirmation();
  const prevUsers = usePrevious(users);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

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
      (membership: Member) => membership.group_id === groupId,
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

    if (!confirmation) {
      await updateMembership(updatedMembership);
      reloadGroups();
      return;
    }

    show({
      ...confirmation,
      title: confirmation.title ?? "",
      onConfirm: async () => {
        await confirmUpdateMembershipAction(
          updatedMembership,
          membershipsByUser[currentUser.id],
          "people",
        );
        reloadGroups();
      },
    });
  };

  const handleRemove = async (groupId: GroupId, userId: User["id"]) => {
    const membershipId = membershipsByUser[userId].find(
      (membership) => membership.group_id === groupId,
    )?.membership_id;

    if (!membershipId) {
      console.error("Tried to remove a membership that does not exist");
      return;
    }

    const confirmation = PLUGIN_GROUP_MANAGERS.getRemoveMembershipConfirmation(
      currentUser,
      membershipsByUser[currentUser.id],
      membershipId,
    );

    if (!confirmation) {
      await deleteMembership(membershipId);
      reloadGroups();
      return;
    }

    show({
      ...confirmation,
      title: confirmation.title ?? "",
      onConfirm: async () => {
        await confirmDeleteMembershipAction(
          membershipId,
          membershipsByUser[currentUser.id],
          "people",
        );
        reloadGroups();
      },
    });
  };

  const handleAdd = (groupId: GroupId, userId: User["id"]) => {
    createMembership({ groupId, userId });
  };

  return (
    <section className={CS.pb4}>
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
        <div
          className={cx(CS.flex, CS.alignCenter, CS.justifyBetween, CS.p2)}
          data-testid="people-list-footer"
        >
          <div className={cx(CS.textMedium, CS.textBold)}>
            {ngettext(
              msgid`${total} person found`,
              `${total} people found`,
              total,
            )}
          </div>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            itemsLength={users.length}
            onNextPage={onNextPage}
            onPreviousPage={onPreviousPage}
          />
        </div>
      )}

      {!hasUsers && (
        <div
          className={cx(
            CS.flex,
            CS.flexColumn,
            CS.alignCenter,
            CS.justifyCenter,
            CS.p4,
            CS.textMedium,
            CS.textCentered,
          )}
        >
          <div className={CS.my3}>
            <Icon name="search" className={CS.mb1} size={32} />
            <h3 className={CS.textLight}>{t`No results found`}</h3>
          </div>
        </div>
      )}

      {modalContent}
    </section>
  );
};

export const PeopleList = _.compose(
  Group.loadList({
    reload: true,
  }),
  Users.loadList({
    reload: true,
    query: (_state: State, { query }: PeopleListQueryProps) => ({
      query: query.searchText,
      status: query.status,
      limit: query.pageSize,
      offset: query.pageSize * query.page,
    }),
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(PeopleListInner);
