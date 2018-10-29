import React, { Component } from "react";

import _ from "underscore";
import cx from "classnames";

import {
  isAdminGroup,
  isDefaultGroup,
  canEditMembership,
  getGroupNameLocalized,
} from "metabase/lib/groups";

import { PermissionsApi } from "metabase/services";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";
import Popover from "metabase/components/Popover.jsx";
import UserAvatar from "metabase/components/UserAvatar.jsx";
import AdminEmptyText from "metabase/components/AdminEmptyText.jsx";
import Alert from "metabase/components/Alert.jsx";

import AdminContentTable from "metabase/components/AdminContentTable.jsx";
import AdminPaneLayout from "metabase/components/AdminPaneLayout.jsx";

import Typeahead from "metabase/hoc/Typeahead.jsx";

import AddRow from "./AddRow.jsx";

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

// ------------------------------------------------------------ Add User Row / Autocomplete ------------------------------------------------------------

const AddMemberAutocompleteSuggestion = ({
  user,
  color,
  selected,
  onClick,
}) => (
  <div
    className={cx("px2 py1 cursor-pointer", { "bg-brand": selected })}
    onClick={onClick}
  >
    <span className="inline-block text-white mr2">
      <UserAvatar background={color} user={user} />
    </span>
    <span className={cx("h3", { "text-white": selected })}>
      {user.common_name}
    </span>
  </div>
);

const COLORS = ["bg-error", "bg-purple", "bg-brand", "bg-gold", "bg-green"];

const AddMemberTypeahead = Typeahead({
  optionFilter: (text, user) =>
    (user.common_name || "").toLowerCase().includes(text.toLowerCase()),
  optionIsEqual: (userA, userB) => userA.id === userB.id,
})(({ suggestions, selectedSuggestion, onSuggestionAccepted }) => (
  <Popover
    className="bordered"
    hasArrow={false}
    targetOffsetY={2}
    targetOffsetX={0}
    horizontalAttachments={["left"]}
  >
    {suggestions &&
      suggestions.map((user, index) => (
        <AddMemberAutocompleteSuggestion
          key={index}
          user={user}
          color={COLORS[index % COLORS.length]}
          selected={selectedSuggestion && user.id === selectedSuggestion.id}
          onClick={onSuggestionAccepted.bind(null, user)}
        />
      ))}
  </Popover>
));

const AddUserRow = ({
  users,
  text,
  selectedUsers,
  onCancel,
  onDone,
  onTextChange,
  onSuggestionAccepted,
  onRemoveUserFromSelection,
}) => (
  <tr>
    <td colSpan="3" style={{ padding: 0 }}>
      <AddRow
        value={text}
        isValid={selectedUsers.length}
        placeholder="Julie McMemberson"
        onChange={e => onTextChange(e.target.value)}
        onDone={onDone}
        onCancel={onCancel}
      >
        {selectedUsers.map(user => (
          <div className="bg-medium p1 px2 mr1 rounded flex align-center">
            {user.common_name}
            <Icon
              className="pl1 cursor-pointer text-slate text-medium-hover"
              name="close"
              onClick={() => onRemoveUserFromSelection(user)}
            />
          </div>
        ))}
        <div className="absolute bottom left">
          <AddMemberTypeahead
            value={text}
            options={Object.values(users)}
            onSuggestionAccepted={onSuggestionAccepted}
          />
        </div>
      </AddRow>
    </td>
  </tr>
);

// ------------------------------------------------------------ Users Table ------------------------------------------------------------

const UserRow = ({ user, showRemoveButton, onRemoveUserClicked }) => (
  <tr>
    <td>{user.first_name + " " + user.last_name}</td>
    <td>{user.email}</td>
    {showRemoveButton ? (
      <td
        className="text-right cursor-pointer"
        onClick={onRemoveUserClicked.bind(null, user)}
      >
        <Icon name="close" className="text-light" size={16} />
      </td>
    ) : null}
  </tr>
);

const MembersTable = ({
  group,
  members,
  users,
  showAddUser,
  text,
  selectedUsers,
  onAddUserCancel,
  onAddUserDone,
  onAddUserTextChange,
  onUserSuggestionAccepted,
  onRemoveUserClicked,
  onRemoveUserFromSelection,
}) => {
  // you can't remove people from Default and you can't remove the last user from Admin
  const showRemoveMemeberButton =
    !isDefaultGroup(group) && (!isAdminGroup(group) || members.length > 1);

  return (
    <div>
      <AdminContentTable columnTitles={[t`Members`, t`Email`]}>
        {showAddUser && (
          <AddUserRow
            users={users}
            text={text}
            selectedUsers={selectedUsers}
            onCancel={onAddUserCancel}
            onDone={onAddUserDone}
            onTextChange={onAddUserTextChange}
            onSuggestionAccepted={onUserSuggestionAccepted}
            onRemoveUserFromSelection={onRemoveUserFromSelection}
          />
        )}
        {members &&
          members.map((user, index) => (
            <UserRow
              key={index}
              user={user}
              showRemoveButton={showRemoveMemeberButton}
              onRemoveUserClicked={onRemoveUserClicked}
            />
          ))}
      </AdminContentTable>
      {members.length === 0 && (
        <div className="mt4 pt4 flex layout-centered">
          <AdminEmptyText
            message={t`A group is only as good as its members.`}
          />
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------ Logic ------------------------------------------------------------

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
          let members = await PermissionsApi.createMembership({
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

  async onRemoveUserClicked(membership) {
    try {
      await PermissionsApi.deleteMembership({ id: membership.membership_id });
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
    let { group, users } = this.props;
    const { text, selectedUsers, addUserVisible, alertMessage } = this.state;
    const members = this.getMembers();

    group = group || {};
    users = users || {};

    let usedUsers = {};
    for (const user of members) {
      usedUsers[user.user_id] = true;
    }
    for (const user of selectedUsers) {
      usedUsers[user.id] = true;
    }
    const filteredUsers = Object.values(users).filter(
      user => !usedUsers[user.id],
    );

    return (
      <AdminPaneLayout
        title={getGroupNameLocalized(group)}
        buttonText={t`Add members`}
        buttonAction={
          canEditMembership(group) ? this.onAddUsersClicked.bind(this) : null
        }
        buttonDisabled={addUserVisible}
      >
        <GroupDescription group={group} />
        <MembersTable
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
