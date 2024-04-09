/* eslint-disable react/prop-types */
import cx from "classnames";
import { Fragment, useEffect, useState } from "react";
import { connect } from "react-redux";
import { t, ngettext, msgid } from "ttag";

import { AdminPaneLayout } from "metabase/components/AdminPaneLayout";
import Alert from "metabase/components/Alert";
import CS from "metabase/css/core/index.css";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import {
  isAdminGroup,
  isDefaultGroup,
  canEditMembership,
  getGroupNameLocalized,
} from "metabase/lib/groups";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUser } from "metabase/selectors/user";

import {
  createMembership,
  deleteMembership,
  updateMembership,
  loadMemberships,
} from "../people";
import { getGroupMemberships, getMembershipsByUser } from "../selectors";

import GroupMembersTable from "./GroupMembersTable";

const GroupDescription = ({ group }) =>
  isDefaultGroup(group) ? (
    <div className={cx(CS.px2, CS.textMeasure)}>
      <p>
        {t`All users belong to the ${getGroupNameLocalized(
          group,
        )} group and can't be removed from it. Setting permissions for this group is a great way to
                make sure you know what new Metabase users will be able to see.`}
      </p>
    </div>
  ) : isAdminGroup(group) ? (
    <div className={cx(CS.px2, CS.textMeasure)}>
      <p>
        {t`This is a special group whose members can see everything in the Metabase instance, and who can access and make changes to the
                settings in the Admin Panel, including changing permissions! So, add people to this group with care.`}
      </p>
      <p>
        {t`To make sure you don't get locked out of Metabase, there always has to be at least one user in this group.`}
      </p>
    </div>
  ) : null;

const mapStateToProps = (state, props) => ({
  groupMemberships: getGroupMemberships(state, props),
  membershipsByUser: getMembershipsByUser(state),
  currentUser: getUser(state),
});

const mapDispatchToProps = {
  createMembership,
  deleteMembership,
  updateMembership,
  loadMemberships,
  confirmDeleteMembershipAction: (membershipId, userMemberships) =>
    PLUGIN_GROUP_MANAGERS.confirmDeleteMembershipAction(
      membershipId,
      userMemberships,
    ),
  confirmUpdateMembershipAction: (membership, userMemberships) =>
    PLUGIN_GROUP_MANAGERS.confirmUpdateMembershipAction(
      membership,
      userMemberships,
    ),
};

const GroupDetail = ({
  currentUser,
  group,
  users,
  membershipsByUser,
  groupMemberships,
  createMembership,
  updateMembership,
  deleteMembership,
  loadMemberships,
  confirmDeleteMembershipAction,
  confirmUpdateMembershipAction,
}) => {
  const { modalContent, show } = useConfirmation();
  const [addUserVisible, setAddUserVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState(null);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

  const alert = alertMessage => setAlertMessage(alertMessage);

  const onAddUsersClicked = () => setAddUserVisible(true);

  const onAddUserCanceled = () => setAddUserVisible(false);

  const onAddUserDone = async userIds => {
    setAddUserVisible(false);
    try {
      await Promise.all(
        userIds.map(async userId => {
          await createMembership({
            groupId: group.id,
            userId,
          });
        }),
      );
    } catch (error) {
      alert(error && typeof error.data ? error.data : error);
    }
  };

  const handleChange = async membership => {
    const confirmation = PLUGIN_GROUP_MANAGERS.getChangeMembershipConfirmation(
      currentUser,
      membership,
    );

    if (!confirmation) {
      return await updateMembership(membership);
    }

    show({
      ...confirmation,
      onConfirm: () =>
        confirmUpdateMembershipAction(
          membership,
          membershipsByUser[currentUser.id],
        ),
    });
  };

  const handleRemove = async membershipId => {
    const confirmation = PLUGIN_GROUP_MANAGERS.getRemoveMembershipConfirmation(
      currentUser,
      membershipsByUser[currentUser.id],
      membershipId,
    );

    if (!confirmation) {
      return await deleteMembership(membershipId);
    }

    show({
      ...confirmation,
      onConfirm: () =>
        confirmDeleteMembershipAction(
          membershipId,
          membershipsByUser[currentUser.id],
        ),
    });
  };

  return (
    <AdminPaneLayout
      title={
        <Fragment>
          {getGroupNameLocalized(group ?? {})}
          <span className={cx(CS.textLight, CS.ml1)}>
            {ngettext(
              msgid`${group.members.length} member`,
              `${group.members.length} members`,
              group.members.length,
            )}
          </span>
        </Fragment>
      }
      buttonText={t`Add members`}
      buttonAction={canEditMembership(group) ? onAddUsersClicked : null}
      buttonDisabled={addUserVisible}
    >
      <GroupDescription group={group} />
      <GroupMembersTable
        groupMemberships={groupMemberships}
        membershipsByUser={membershipsByUser}
        currentUser={currentUser}
        group={group}
        users={users}
        showAddUser={addUserVisible}
        onAddUserCancel={onAddUserCanceled}
        onAddUserDone={onAddUserDone}
        onMembershipRemove={handleRemove}
        onMembershipUpdate={handleChange}
      />
      <Alert message={alertMessage} onClose={() => alert(null)} />
      {modalContent}
    </AdminPaneLayout>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(GroupDetail);
