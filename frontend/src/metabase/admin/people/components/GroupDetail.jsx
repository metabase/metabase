/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";

import _ from "underscore";

import {
  isAdminGroup,
  isDefaultGroup,
  canEditMembership,
  getGroupNameLocalized,
} from "metabase/lib/groups";

import { PermissionsApi } from "metabase/services";
import { t, ngettext, msgid } from "ttag";
import Alert from "metabase/components/Alert";
import AdminPaneLayout from "metabase/components/AdminPaneLayout";

import GroupMembersTable from "./group-members/GroupMembersTable";
import { deleteMembership } from "../people";

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

@connect(
  null,
  {
    deleteMembership,
  },
)
export default class GroupDetail extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      addUserVisible: false,
      text: "",
      selectedUsers: [],
      members: null,
      alertMessage: null,
    };
  }

  alert(alertMessage) {
    this.setState({ alertMessage });
  }

  onAddUsersClicked() {
    this.setState({
      addUserVisible: true,
    });
  }

  onAddUserCanceled() {
    this.setState({
      addUserVisible: false,
      text: "",
      selectedUsers: [],
    });
  }

  async onAddUserDone() {
    this.setState({
      addUserVisible: false,
      text: "",
      selectedUsers: [],
    });
    try {
      await Promise.all(
        this.state.selectedUsers.map(async user => {
          const members = await PermissionsApi.createMembership({
            group_id: this.props.group.id,
            user_id: user.id,
          });
          this.setState({ members });
        }),
      );
    } catch (error) {
      this.alert(error && typeof error.data ? error.data : error);
    }
  }

  onAddUserTextChange(newText) {
    this.setState({
      text: newText,
    });
  }

  onUserSuggestionAccepted(user) {
    this.setState({
      selectedUsers: this.state.selectedUsers.concat(user),
      text: "",
    });
  }

  onRemoveUserFromSelection(user) {
    this.setState({
      selectedUsers: this.state.selectedUsers.filter(u => u.id !== user.id),
    });
  }

  async onRemoveUserClicked(user) {
    try {
      const membership = this.props.group.members.find(
        m => m.user_id === user.id,
      );
      await this.props.deleteMembership({
        membershipId: membership.membership_id,
      });
      const newMembers = _.reject(
        this.getMembers(),
        m => m.user_id === membership.user_id,
      );
      this.setState({ members: newMembers });
    } catch (error) {
      console.error("Error deleting PermissionsMembership:", error);
      this.alert(error && typeof error.data ? error.data : error);
    }
  }

  // TODO - bad!
  // TODO - this totally breaks if you edit members and then switch groups !
  getMembers() {
    return (
      this.state.members || (this.props.group && this.props.group.members) || []
    );
  }

  render() {
    // users = array of all users for purposes of adding new users to group
    // [group.]members = array of users currently in the group
    let { currentUser, group, users } = this.props;
    const { text, selectedUsers, addUserVisible, alertMessage } = this.state;
    const members = this.getMembers();

    group = group || {};
    users = users || {};

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

    const title = (
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
    );

    return (
      <AdminPaneLayout
        title={title}
        buttonText={t`Add members`}
        buttonAction={
          canEditMembership(group) ? this.onAddUsersClicked.bind(this) : null
        }
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
          onAddUserCancel={this.onAddUserCanceled.bind(this)}
          onAddUserDone={this.onAddUserDone.bind(this)}
          onAddUserTextChange={this.onAddUserTextChange.bind(this)}
          onUserSuggestionAccepted={this.onUserSuggestionAccepted.bind(this)}
          onRemoveUserFromSelection={this.onRemoveUserFromSelection.bind(this)}
          onRemoveUserClicked={this.onRemoveUserClicked.bind(this)}
        />
        <Alert
          message={alertMessage}
          onClose={() => this.setState({ alertMessage: null })}
        />
      </AdminPaneLayout>
    );
  }
}
