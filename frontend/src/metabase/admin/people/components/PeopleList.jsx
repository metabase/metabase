import cx from "classnames";
import PropTypes from "prop-types";
import { Fragment, useEffect } from "react";
import { usePrevious } from "react-use";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { useListUsersQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import Group from "metabase/entities/groups";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { connect } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Icon } from "metabase/ui";

import { USER_STATUS } from "../constants";
import {
  createMembership,
  deleteMembership,
  loadMemberships,
  updateMembership,
} from "../people";
import { getMembershipsByUser } from "../selectors";

import PeopleListRow from "./PeopleListRow";

const mapStateToProps = state => ({
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
  confirmDeleteMembershipAction: async (membershipId, userMemberships, view) =>
    PLUGIN_GROUP_MANAGERS.confirmDeleteMembershipAction(
      membershipId,
      userMemberships,
      view,
    ),
  confirmUpdateMembershipAction: async (membership, userMemberships, view) =>
    PLUGIN_GROUP_MANAGERS.confirmUpdateMembershipAction(
      membership,
      userMemberships,
      view,
    ),
};

const defaultUsersValue = [];

const PeopleList = ({
  currentUser,
  groups,
  query,
  membershipsByUser,
  isAdmin,
  loadMemberships,
  createMembership,
  deleteMembership,
  updateMembership,
  confirmDeleteMembershipAction,
  confirmUpdateMembershipAction,
  reloadGroups,
  onNextPage,
  onPreviousPage,
}) => {
  const { modalContent, show } = useConfirmation();

  const {
    data,
    isLoading,
    error,
    refetch: reloadUsers,
  } = useListUsersQuery({
    query: query.searchText,
    status: query.status,
    limit: query.pageSize,
    offset: query.pageSize * query.page,
  });

  const users = data?.data || defaultUsersValue;
  const total = data?.total ?? 0;

  const prevUsers = usePrevious(users);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

  useEffect(() => {
    if (!prevUsers) {
      return;
    }

    const areSameUsers = _.isEqual(
      prevUsers.map(u => u.id),
      users.map(u => u.id),
    );

    if (!areSameUsers) {
      return;
    }

    const isActivityChanged = !_.isEqual(
      prevUsers.map(u => u.is_active),
      users.map(u => u.is_active),
    );

    if (isActivityChanged) {
      reloadUsers();
    }
  }, [prevUsers, reloadUsers, users]);

  const { page, pageSize, status } = query;

  const isCurrentUser = u => currentUser?.id === u.id;
  const showDeactivated = status === USER_STATUS.deactivated;
  const hasUsers = users.length > 0;

  const handleChange = async (groupId, membershipData, userId) => {
    const membership = membershipsByUser[userId].find(
      membership => membership.group_id === groupId,
    );
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

  const handleRemove = async (groupId, userId) => {
    const membershipId = membershipsByUser[userId].find(
      membership => membership.group_id === groupId,
    ).membership_id;

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

  const handleAdd = (groupId, userId) => {
    createMembership({ groupId, userId });
  };

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
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
              users.map(user => (
                <PeopleListRow
                  key={user.id}
                  user={user}
                  showDeactivated={showDeactivated}
                  groups={groups}
                  userMemberships={membershipsByUser[user.id]}
                  isCurrentUser={isCurrentUser(user)}
                  isAdmin={isAdmin}
                  onAdd={groupId => handleAdd(groupId, user.id)}
                  onRemove={groupId => handleRemove(groupId, user.id)}
                  onChange={(groupId, membershipData) =>
                    handleChange(groupId, membershipData, user.id)
                  }
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
    </LoadingAndErrorWrapper>
  );
};

PeopleList.propTypes = {
  query: PropTypes.shape({
    searchText: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    page: PropTypes.number.isRequired,
    pageSize: PropTypes.number.isRequired,
  }),
  membershipsByUser: PropTypes.object,
  currentUser: PropTypes.object.isRequired,
  users: PropTypes.array,
  groups: PropTypes.array,
  isAdmin: PropTypes.bool,
  loadMemberships: PropTypes.func.isRequired,
  createMembership: PropTypes.func.isRequired,
  deleteMembership: PropTypes.func.isRequired,
  updateMembership: PropTypes.func.isRequired,
  confirmDeleteMembershipAction: PropTypes.func.isRequired,
  confirmUpdateMembershipAction: PropTypes.func.isRequired,
  onNextPage: PropTypes.func,
  onPreviousPage: PropTypes.func,
  reloadGroups: PropTypes.func.isRequired,
};

export default _.compose(
  Group.loadList({
    reload: true,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(PeopleList);
