import cx from "classnames";
import { Fragment, useEffect, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { AdminPaneLayout } from "metabase/components/AdminPaneLayout";
import Alert from "metabase/components/Alert";
import CS from "metabase/css/core/index.css";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import {
  canEditMembership,
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { connect } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUser } from "metabase/selectors/user";
import type { Group, Member, User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  createMembership,
  deleteMembership,
  loadMemberships,
  updateMembership,
} from "../people";
import { getGroupMemberships, getMembershipsByUser } from "../selectors";

import GroupMembersTable from "./GroupMembersTable";

interface GroupDescriptionProps {
  group: Group;
}

const GroupDescription = ({ group }: GroupDescriptionProps) =>
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

interface GroupDetailStateProps {
  groupMemberships: Member[];
  membershipsByUser: Record<User["id"], Member[]>;
  currentUser: User | null;
}

interface GroupDetailOwnProps {
  group: Group;
  users: User[];
}

const mapStateToProps = (
  state: State,
  props: GroupDetailOwnProps,
): GroupDetailStateProps => ({
  // @ts-expect-error -- .js file imports with wrong type here, not worth fixing as we should just move to RTKQuery
  groupMemberships: getGroupMemberships(state, props),
  membershipsByUser: getMembershipsByUser(state),
  currentUser: getUser(state),
});

interface GroupDetailDispatchProps {
  createMembership: (membership: { groupId: number; userId: number }) => void;
  updateMembership: (membership: Member) => void;
  deleteMembership: (membershipId: number) => void;
  loadMemberships: () => void;
  confirmDeleteMembershipAction: (
    membershipId: number,
    userMemberships: Member[],
  ) => void;
  confirmUpdateMembershipAction: (
    membership: Member,
    userMemberships: Member[],
  ) => void;
}

const mapDispatchToProps: GroupDetailDispatchProps = {
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

type GroupDetailProps = GroupDetailStateProps &
  GroupDetailOwnProps &
  GroupDetailDispatchProps;

const GroupDetailInner = ({
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
}: GroupDetailProps) => {
  const { modalContent, show } = useConfirmation();
  const [addUserVisible, setAddUserVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

  const alert = (message: string | null) => setAlertMessage(message);

  const onAddUsersClicked = () => setAddUserVisible(true);

  const onAddUserCanceled = () => setAddUserVisible(false);

  const onAddUserDone = async (userIds: number[]) => {
    setAddUserVisible(false);
    try {
      await Promise.all(
        userIds.map(async (userId) => {
          await createMembership({
            groupId: group.id,
            userId,
          });
        }),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      alert(errorMessage);
    }
  };

  const handleChange = async (membership: Member) => {
    if (!currentUser) {
      throw new Error("currentUser is not defined");
      return;
    }

    const confirmation = PLUGIN_GROUP_MANAGERS.getChangeMembershipConfirmation(
      currentUser,
      membership,
    );

    if (!confirmation) {
      return await updateMembership(membership);
    }

    show({
      ...confirmation,
      title: confirmation.title ?? "",
      onConfirm: () =>
        confirmUpdateMembershipAction(
          membership,
          membershipsByUser[currentUser.id],
        ),
    });
  };

  const handleRemove = async (membershipId: number) => {
    if (!currentUser) {
      throw new Error("currentUser is not defined");
      return;
    }

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
      title: confirmation.title ?? "",
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
      buttonAction={canEditMembership(group) ? onAddUsersClicked : undefined}
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

export const GroupDetail = connect(
  mapStateToProps,
  mapDispatchToProps,
)(GroupDetailInner);
