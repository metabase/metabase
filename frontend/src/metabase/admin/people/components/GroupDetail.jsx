/* eslint-disable react/prop-types */
import React, { useState, useMemo, useCallback } from "react";
import { connect } from "react-redux";

import _ from "underscore";

import {
  isAdminGroup,
  isDefaultGroup,
  canEditMembership,
  getGroupNameLocalized,
} from "metabase/lib/groups";

import { t, ngettext, msgid } from "ttag";
import Alert from "metabase/components/Alert";
import AdminPaneLayout from "metabase/components/AdminPaneLayout";

import GroupMembersTable from "./group-members/GroupMembersTable";
import { deleteMembership, createMembership } from "../people";

const GroupDescription = ({ group }) =>
  isDefaultGroup(group) ? (
    <div className="px2 text-measure">
      <p>
        {t`All users belong to the ${getGroupNameLocalized(
          group,
        )} group and can't be removed from it. Setting permissions for this group is a great way to
                make sure you know what new Metabase users will be able to see.`}
      </p>
    </div>
  ) : isAdminGroup(group) ? (
    <div className="px2 text-measure">
      <p>
        {t`This is a special group whose members can see everything in the Metabase instance, and who can access and make changes to the
                settings in the Admin Panel, including changing permissions! So, add people to this group with care.`}
      </p>
      <p>
        {t`To make sure you don't get locked out of Metabase, there always has to be at least one user in this group.`}
      </p>
    </div>
  ) : null;

const GroupDetail = props => {
  const [addUserVisible, setAddUserVisible] = useState(false);
  const [text, setText] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [alertMessage, setAlertMessage] = useState(false);

  const {
    currentUser,
    group,
    users,
    deleteMembership,
    createMembership,
  } = props;
  const { members } = group;

  const usedUsers = {};
  for (const user of members) {
    usedUsers[user.user_id] = true;
  }
  for (const user of selectedUsers) {
    usedUsers[user.id] = true;
  }
  const filteredUsers = Object.values(users).filter(
    user => !usedUsers[user.id],
  );

  const title = useMemo(
    () => (
      <React.Fragment>
        {getGroupNameLocalized(group)}
        <span className="text-light ml1">
          {ngettext(
            msgid`${members.length} member`,
            `${members.length} members`,
            members.length,
          )}
        </span>
      </React.Fragment>
    ),
    [group, members],
  );

  const onRemoveUserClicked = useCallback(
    async user => {
      try {
        const membership = members.find(m => m.user_id === user.id);
        await deleteMembership({
          membershipId: membership.membership_id,
          groupId: group.id,
        });
      } catch (error) {
        console.error("Error deleting PermissionsMembership:", error);
        setAlertMessage(error && typeof error.data ? error.data : error);
      }
    },
    [members, deleteMembership, group.id],
  );

  const onAddUserDone = useCallback(async () => {
    try {
      await Promise.all(
        selectedUsers.map(async user => {
          await createMembership({
            groupId: group.id,
            userId: user.id,
          });
        }),
      );
      setAddUserVisible(false);
      setText("");
      setSelectedUsers([]);
    } catch (error) {
      setAlertMessage(error && typeof error.data ? error.data : error);
    }
  }, [selectedUsers, createMembership, group.id]);

  const onAddUserCanceled = useCallback(() => {
    setAddUserVisible(false);
    setText("");
    setSelectedUsers([]);
  }, []);

  const onUserSuggestionAccepted = useCallback(user => {
    setSelectedUsers(u => [...u, user]);
    setText("");
  }, []);

  const onRemoveUserFromSelection = useCallback(user => {
    setSelectedUsers(users => users.filter(u => u.id !== user.id));
  }, []);

  const dismissAlert = useCallback(() => {
    setAlertMessage(null);
  }, []);

  const canEdit = useMemo(() => {
    return canEditMembership(group) ? () => setAddUserVisible(true) : null;
  }, [group]);

  return (
    <AdminPaneLayout
      title={title}
      buttonText={t`Add members`}
      buttonAction={canEdit}
      buttonDisabled={addUserVisible}
    >
      <GroupDescription group={group} />
      <GroupMembersTable
        currentUser={currentUser}
        group={group}
        members={members}
        users={filteredUsers}
        showAddUser={addUserVisible}
        text={text || ""}
        selectedUsers={selectedUsers}
        onAddUserCancel={onAddUserCanceled}
        onAddUserDone={onAddUserDone}
        onAddUserTextChange={setText}
        onUserSuggestionAccepted={onUserSuggestionAccepted}
        onRemoveUserFromSelection={onRemoveUserFromSelection}
        onRemoveUserClicked={onRemoveUserClicked}
      />
      <Alert message={alertMessage} onClose={dismissAlert} />
    </AdminPaneLayout>
  );
};

export default _.compose(
  connect(null, {
    deleteMembership,
    createMembership,
  }),
)(GroupDetail);
