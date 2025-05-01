import { Fragment, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  useCreateMembershipMutation,
  useDeleteMembershipMutation,
  useListUserMembershipsQuery,
  useUpdateMembershipMutation,
} from "metabase/api";
import { AdminPaneLayout } from "metabase/components/AdminPaneLayout";
import Alert from "metabase/components/Alert";
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
import { Box } from "metabase/ui";
import type { Group, Member, Membership } from "metabase-types/api";

import { GroupMembersTable } from "./GroupMembersTable";

interface GroupDescriptionProps {
  group: Group;
}

export const GroupDetail = ({ group }: { group: Group }) => {
  const dispatch = useDispatch();
  const currentUser = useSelector(getUser);

  // TODO: pretty sure this can be removed and all checks that use is can just use group.members
  const { data: membershipsByUser = {} } = useListUserMembershipsQuery();
  const [createMembership] = useCreateMembershipMutation();
  const [updateMembership] = useUpdateMembershipMutation();
  const [deleteMembership] = useDeleteMembershipMutation();

  const { modalContent, show } = useConfirmation();
  const [addUserVisible, setAddUserVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const confirmDeleteMembershipAction = (
    membershipId: number,
    userMemberships: Membership[],
  ) =>
    dispatch(
      PLUGIN_GROUP_MANAGERS.confirmDeleteMembershipAction(
        membershipId,
        userMemberships,
      ),
    );

  const confirmUpdateMembershipAction = (
    membership: Member,
    userMemberships: Membership[],
  ) =>
    PLUGIN_GROUP_MANAGERS.confirmUpdateMembershipAction(
      membership,
      userMemberships,
    );

  const onAddUsersClicked = () => setAddUserVisible(true);
  const onAddUserCanceled = () => setAddUserVisible(false);
  const onAddUserDone = async (userIds: number[]) => {
    setAddUserVisible(false);
    try {
      await Promise.all(
        userIds.map((userId) =>
          createMembership({ group_id: group.id, user_id: userId }).unwrap(),
        ),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setAlertMessage(errorMessage);
    }
  };

  const handleChange = async (membership: Member) => {
    if (!currentUser) {
      throw new Error("currentUser is not defined");
    }

    const confirmation = PLUGIN_GROUP_MANAGERS.getChangeMembershipConfirmation(
      currentUser,
      membership,
    );

    if (!confirmation) {
      return await updateMembership(membership).unwrap();
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

  const handleRemove = async (membership: Membership) => {
    if (!currentUser) {
      throw new Error("currentUser is not defined");
    }

    const confirmation = PLUGIN_GROUP_MANAGERS.getRemoveMembershipConfirmation(
      currentUser,
      membershipsByUser[currentUser.id],
      membership.membership_id,
    );

    if (!confirmation) {
      return await deleteMembership(membership).unwrap();
    }

    show({
      ...confirmation,
      title: confirmation.title ?? "",
      onConfirm: () =>
        confirmDeleteMembershipAction(
          membership.membership_id,
          membershipsByUser[currentUser.id],
        ),
    });
  };

  return (
    <AdminPaneLayout
      title={
        <Fragment>
          {getGroupNameLocalized(group ?? {})}
          <Box component="span" c="text-light" ms="sm">
            {ngettext(
              msgid`${group.members.length} member`,
              `${group.members.length} members`,
              group.members.length,
            )}
          </Box>
        </Fragment>
      }
      buttonText={t`Add members`}
      buttonAction={canEditMembership(group) ? onAddUsersClicked : undefined}
      buttonDisabled={addUserVisible}
    >
      <GroupDescription group={group} />
      <GroupMembersTable
        group={group}
        showAddUser={addUserVisible}
        onAddUserCancel={onAddUserCanceled}
        onAddUserDone={onAddUserDone}
        onMembershipRemove={handleRemove}
        onMembershipUpdate={handleChange}
      />
      <Alert message={alertMessage} onClose={() => setAlertMessage(null)} />
      {modalContent}
    </AdminPaneLayout>
  );
};

const GroupDescription = ({ group }: GroupDescriptionProps) => {
  if (isDefaultGroup(group)) {
    return (
      <Box maw="38rem" px="1rem">
        <p>
          {t`All users belong to the ${getGroupNameLocalized(
            group,
          )} group and can't be removed from it. Setting permissions for this group is a great way to
        make sure you know what new Metabase users will be able to see.`}
        </p>
      </Box>
    );
  }

  if (isAdminGroup(group)) {
    return (
      <Box maw="38rem" px="1rem">
        <p>
          {t`This is a special group whose members can see everything in the Metabase instance, and who can access and make changes to the
        settings in the Admin Panel, including changing permissions! So, add people to this group with care.`}
        </p>
        <p>
          {t`To make sure you don't get locked out of Metabase, there always has to be at least one user in this group.`}
        </p>
      </Box>
    );
  }

  return null;
};
