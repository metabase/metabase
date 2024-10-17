/* eslint-disable react/prop-types */
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
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUser } from "metabase/selectors/user";
import type { Group, Member, UserId } from "metabase-types/api";

import {
  createMembership,
  deleteMembership,
  loadMemberships,
  updateMembership,
} from "../people";
import { getMembershipsByUser, getMembershipsList } from "../selectors";

import { GroupMembersTable } from "./GroupMembersTable";

const GroupDescription = ({ group }: { group: Group }) =>
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

export const GroupDetail = ({ group }: { group: Group }) => {
  const dispatch = useDispatch();

  const membershipsList = useSelector(getMembershipsList);
  const groupMemberships = membershipsList.filter(
    membership => membership.group_id === group.id,
  );
  const membershipsByUser = useSelector(getMembershipsByUser);
  const currentUser = useSelector(getUser);

  const { modalContent, show } = useConfirmation();
  const [addUserVisible, setAddUserVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    dispatch(loadMemberships());
  }, [dispatch]);

  const alert = (alertMessage: string | null) => setAlertMessage(alertMessage);

  const onAddUsersClicked = () => setAddUserVisible(true);

  const onAddUserCanceled = () => setAddUserVisible(false);

  const onAddUserDone = async (userIds: UserId[]) => {
    setAddUserVisible(false);
    try {
      await Promise.all(
        userIds.map(async userId => {
          await dispatch(
            createMembership({
              groupId: group.id,
              userId,
            }),
          );
        }),
      );
    } catch (error) {
      const e = error as { data: string } | string;
      alert(typeof e === "object" ? e.data : e);
    }
  };

  const handleChange = async (membership: Member) => {
    if (currentUser) {
      const confirmation =
        PLUGIN_GROUP_MANAGERS.getChangeMembershipConfirmation(
          currentUser,
          membership,
        );

      if (!confirmation) {
        return await dispatch(updateMembership(membership));
      }

      show({
        ...confirmation,
        onConfirm: () =>
          dispatch(
            PLUGIN_GROUP_MANAGERS.confirmUpdateMembershipAction(
              membership,
              membershipsByUser[currentUser.id],
            ),
          ),
      });
    }
  };

  const handleRemove = async (membershipId: Member["membership_id"]) => {
    if (currentUser) {
      const confirmation =
        PLUGIN_GROUP_MANAGERS.getRemoveMembershipConfirmation(
          currentUser,
          membershipsByUser[currentUser.id],
          membershipId,
        );

      if (!confirmation) {
        return await dispatch(deleteMembership(membershipId));
      }

      show({
        ...confirmation,
        onConfirm: () =>
          dispatch(
            PLUGIN_GROUP_MANAGERS.confirmDeleteMembershipAction(
              membershipId,
              membershipsByUser[currentUser.id],
            ),
          ),
      });
    }
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
        group={group}
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
