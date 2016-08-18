import React, { Component } from "react";
import { Link } from "react-router";

import _ from "underscore";
import cx from "classnames";

import { AngularResourceProxy } from "metabase/lib/redux";

import Icon from "metabase/components/Icon.jsx";
import Input from "metabase/components/Input.jsx";
import Popover from "metabase/components/Popover.jsx";
import UserAvatar from "metabase/components/UserAvatar.jsx";

import AdminContentTable from "./AdminContentTable.jsx";
import Permissions from "./Permissions.jsx";
import { LeftNavPane, LeftNavPaneItem, LeftNavPaneItemBack } from "./LeftNavPane.jsx";


const PermissionsAPI = new AngularResourceProxy("Permissions", ["createMembership", "deleteMembership"]);


// ------------------------------------------------------------ Title & Nav ------------------------------------------------------------

function AddMembersButton({ addUserVisible, onClick }) {
    return (
        <button className={cx("Button float-right", {"Button--primary": !addUserVisible})} disabled={addUserVisible} onClick={onClick}>
            Add members
        </button>
    );
}

function TitleForDefault() {
    return (
        <section className="PageHeader clearfix">
            <h2 className="PageTitle">
                Default Group
            </h2>
            <p>
                All users belong to the Default Group and can't be removed from it. Setting permissions for this group is a great way to
                make sure you know what new Metabase users will be able to see.
            </p>
        </section>
    );
}

function TitleForAdmin({ addUserVisible, onAddUsersClicked }) {
    return (
        <section className="PageHeader clearfix">
            <AddMembersButton addUserVisible={addUserVisible} onClick={onAddUsersClicked} />
            <h2 className="PageTitle">
                Admin
            </h2>
            <p>
                This is a special group whose members can see everything in the Metabase instance, and who can access and make changes to the
                settings in the Admin Panel, including changing permissions! So, add people to this group with care.
            </p>
            <p>
                To make sure you don't get locked out of Metabase, there always has to be at least one user in this group.
            </p>
        </section>
    );
}

function Title({ group, addUserVisible, onAddUsersClicked }) {
    return group.name === "Default" ? (
        <TitleForDefault />
    ) : group.name === "Admin" ? (
        <TitleForAdmin addUserVisible={addUserVisible} onAddUsersClicked={onAddUsersClicked} />
    ) : (
        <section className="PageHeader clearfix">
            <AddMembersButton addUserVisible={addUserVisible} onClick={onAddUsersClicked} />
            <h2 className="PageTitle">
                {group.name}
            </h2>
        </section>
    );
}

function NavPane({ groups, currentPath }) {
    return (
        <LeftNavPane>
            <LeftNavPaneItemBack path="/admin/permissions/groups" />
            {groups && groups.map((group) => {
                 const path = "/admin/permissions/groups/" + group.id;
                 return (
                     <LeftNavPaneItem key={group.id} name={group.name} path={path} selected={currentPath.startsWith(path)} />
                 );
             })}
        </LeftNavPane>
    );
}


// ------------------------------------------------------------ Add User Row / Autocomplete ------------------------------------------------------------

function AddMemberAutocompleteSuggestion({ user, color, selected, onClick }) {
    return (
        <div className={cx("px2 py1 cursor-pointer", {"bg-brand": selected})} onClick={onClick} >
            <span className="inline-block text-white mr2">
                <UserAvatar background={color} user={user} />
            </span>
            <span className={cx("h3", {"text-white": selected})}>
                {user.common_name}
            </span>
        </div>
    );
}

const COLORS = ['bg-error', 'bg-purple', 'bg-brand', 'bg-gold', 'bg-green'];

function AddMemberAutocompleteSuggestions({ suggestions, selectedUser, onSuggestionAccepted }) {
    return (
        <Popover className="bordered" hasArrow={false} targetOffsetY={2} horizontalAttachments={["left"]}>
            {suggestions && suggestions.map((user, index) =>
                <AddMemberAutocompleteSuggestion key={index} user={user} color={COLORS[(index % COLORS.length)]}
                                                 selected={selectedUser && user.id === selectedUser.id}
                                                 onClick={onSuggestionAccepted.bind(null, user)} />
             )}
        </Popover>
    );
}

/* const KEYCODE_TAB   =  9;*/
const KEYCODE_ENTER = 13;
const KEYCODE_UP    = 38;
const KEYCODE_DOWN  = 40;

function AddUserRow({ suggestions, text, selectedUser, onCancel, onDone, onDownPressed, onUpPressed, onTextChange, onSuggestionAccepted }) {

    const showAutoComplete = suggestions && suggestions.length;

    function onKeyDown(e) {
        if (e.keyCode !== KEYCODE_UP && e.keyCode !== KEYCODE_DOWN && e.keyCode !== KEYCODE_ENTER) return;

        e.preventDefault();
        switch (e.keyCode) {
            case KEYCODE_UP: onUpPressed(); return;
            case KEYCODE_DOWN: onDownPressed(); return;
            case KEYCODE_ENTER: onSuggestionAccepted(selectedUser); return;
        }
    }

    return (
        <tr className="bordered border-brand rounded">
            <td>
                <Input className="AdminInput h3" type="text" placeholder="Julie McMemberson" autoFocus={true} value={text}
                       onKeyDown={onKeyDown} onChange={(e) => onTextChange(e.target.value)}
                />
                {showAutoComplete ? (
                     <AddMemberAutocompleteSuggestions suggestions={suggestions} selectedUser={selectedUser} onSuggestionAccepted={onSuggestionAccepted} />
                 ) : null}
            </td>
            <td />
            <td className="text-right">
                <span className="link no-decoration cursor-pointer" onClick={onCancel}>
                    Cancel
                </span>
                <button className={cx("Button ml2", {"Button--primary": !!selectedUser})} disabled={!selectedUser} onClick={onDone}>
                    Done
                </button>
            </td>
        </tr>
    );
}


// ------------------------------------------------------------ Users Table ------------------------------------------------------------

function UserRow({ user, showRemoveButton, onRemoveUserClicked }) {
    return (
        <tr>
            <td>{user.first_name + " " + user.last_name}</td>
            <td>{user.email}</td>
            {showRemoveButton ? (
                 <td className="text-right cursor-pointer" onClick={onRemoveUserClicked.bind(null, user)}>
                     <Icon name="close" className="text-grey-1" size={16} />
                 </td>
            ) : null}
        </tr>
    );
}

function MembersTable({ group, members, userSuggestions, showAddUser, text, selectedUser, onAddUserCancel, onAddUserDone, onAddUserTextChange,
                        onUserSuggestionAccepted, onAddUserUpPressed, onAddUserDownPressed, onRemoveUserClicked }) {

    // you can't remove people from Default and you can't remove the last user from Admin
    const showRemoveMemeberButton = group.name !== "Default" && (group.name !== "Admin" || members.length > 1);

    return (
        <div>
            <AdminContentTable columnTitles={["Members", "Email"]}>
                {showAddUser ? (
                    <AddUserRow suggestions={userSuggestions} text={text} selectedUser={selectedUser} onCancel={onAddUserCancel}
                                onDone={onAddUserDone} onDownPressed={onAddUserDownPressed} onUpPressed={onAddUserUpPressed}
                                onTextChange={onAddUserTextChange} onSuggestionAccepted={onUserSuggestionAccepted}
                     />
                 ) : null}
                {members && members.map((user, index) =>
                    <UserRow key={index} user={user} showRemoveButton={showRemoveMemeberButton} onRemoveUserClicked={onRemoveUserClicked} />
                )}
            </AdminContentTable>
        </div>
    );
}


// ------------------------------------------------------------ Databases Table ------------------------------------------------------------

function DatabasesListItemSchemasListItem({ schema }) {
    return (
        <li className="my1">
            <Icon name="table2" size={16} className="mr1 text-grey-1" /> {schema.name}
        </li>
    );
}

function DatabasesListItemSchemasList({ schemas }) {
    return (
        <ul>
            {schemas && schemas.map((schema, index) =>
                <DatabasesListItemSchemasListItem key={index} schema={schema} />
             )}
        </ul>
    );
}

function DatabasesListItem({ database, group }) {
    const unrestricted = database.access_type === "unrestricted";
    const allSchemas = database.access_type === "all_schemas";
    const someSchemas = database.access_type === "some_schemas";

    return (
        <div className="my4 py1">
            <Icon className="Icon text-grey-1" name="database" size={16} />
            <span className="mx2">
                {database.name ? database.name.toUpperCase() : null}
            </span>
            <div className="mt3 ml4">
                <div className="text-bold">
                    {unrestricted ? "Unrestricted" :
                     allSchemas   ? "All schemas"  :
                     someSchemas  ? "Some schemas" : "No permissions"}
                    <Link to={"/admin/permissions/databases/" + database.database_id + "/groups/" + group.id}
                          className="no-decoration mx2 link"
                    >
                        Change Settings
                    </Link>
                </div>
                {someSchemas ? (
                     <DatabasesListItemSchemasList schemas={database.schemas} />
                ) : null}
            </div>
        </div>
    );
}

function DatabasesList({ group, databases }) {
    return (
        <div className="mt4">
            <h2>
                What {group.name} Can See
            </h2>
            {databases && databases.map((database, index) =>
                <DatabasesListItem key={index} database={database} group={group} />
             )}
        </div>
    );
}


// ------------------------------------------------------------ Logic ------------------------------------------------------------

function filterUsers(users, text) {
    console.log('filterUsers(', users, text, ')');

    if (!text || !text.length) return users;

    text = text.toLowerCase();
    return _.filter(users, (user) => user.common_name && user.common_name.toLowerCase().includes(text));
}


export default class GroupDetail extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            addUserVisible: false,
            text: "",
            selectedUser: null,
            userSuggestions: [],
            members: null
        };
    }

    onAddUsersClicked() {
        this.setState({
            addUserVisible: true
        });
    }

    onAddUserCanceled() {
        this.setState({
            addUserVisible: false,
            text: "",
            selectedUser: null
        });
    }

    onAddUserDone() {
        PermissionsAPI.createMembership({group_id: this.props.group.id, user_id: this.state.selectedUser.id}).then((function(newMembers) {
            this.setState({
                members: newMembers,
                addUserVisible: false,
                text: "",
                selectedUser: null
            });
        }).bind(this), function(error) {
            console.error("Error adding user:", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    indexOfSelectedUser() {
        return _.findIndex(this.state.userSuggestions, (user) => user.id === this.state.selectedUser.id);
    }

    setSelectedUserIndex(newIndex) {
        const numSuggestions = this.state.userSuggestions.length;
        if (newIndex < 0) newIndex = numSuggestions - 1;
        if (newIndex >= numSuggestions) newIndex = 0;

        this.setState({
            selectedUser: this.state.userSuggestions[newIndex]
        });
    }

    onAddUserUpPressed() {
        if (!this.state.userSuggestions.length) return;

        if (!this.state.selectedUser) {
            this.setState({
                selectedUser: this.state.userSuggestions[(this.state.userSuggestions.length - 1)]
            });
            return;
        }

        this.setSelectedUserIndex(this.indexOfSelectedUser() - 1);
    }

    onAddUserDownPressed() {
        if (!this.state.userSuggestions.length) return;

        if (!this.state.selectedUser) {
            this.setState({
                selectedUser: this.state.userSuggestions[0]
            });
            return;
        }

        this.setSelectedUserIndex(this.indexOfSelectedUser() + 1);
    }

    onAddUserTextChange(newText) {
        this.setState({
            text: newText,
            userSuggestions: filterUsers(this.props.users, newText)
        });
    }

    onUserSuggestionAccepted(user) {
        this.setState({
            selectedUser: user,
            text: user.common_name,
            userSuggestions: []
        });
    }

    onRemoveUserClicked(membership) {
        const members = this.getMembers();

        PermissionsAPI.deleteMembership({id: membership.membership_id}).then((function () {
            const newMembers = _.reject(members, (m) => m.user_id === membership.user_id);
            this.setState({
                members: newMembers
            });
        }).bind(this), function(error) {
            console.error("Error deleting PermissionsMembership:", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    // TODO - bad!
    // TODO - this totally breaks if you edit members and then switch groups !
    getMembers() {
        return this.state.members|| (this.props.group && this.props.group.members) || [];
    }

    render() {
        // users = array of all users for purposes of adding new users to group
        // [group.]members = array of users currently in the group
        let { location: { pathname }, group, groups, users } = this.props;
        group = group || {};
        groups = groups || [];
        users = users || [];

        const members = this.getMembers();
        const userSuggestions = this.state.text && this.state.text.length ? this.state.userSuggestions : users;

        return (
            <Permissions leftNavPane={<NavPane groups={groups} currentPath={pathname} />}>
                <Title group={group} addUserVisible={this.state.addUserVisible}
                       onAddUsersClicked={this.onAddUsersClicked.bind(this)}
                />
                <MembersTable group={group}
                              members={members}
                              userSuggestions={userSuggestions}
                              showAddUser={this.state.addUserVisible}
                              text={this.state.text || ""}
                              selectedUser={this.state.selectedUser}
                              onAddUserCancel={this.onAddUserCanceled.bind(this)}
                              onAddUserDone={this.onAddUserDone.bind(this)}
                              onAddUserTextChange={this.onAddUserTextChange.bind(this)}
                              onUserSuggestionAccepted={this.onUserSuggestionAccepted.bind(this)}
                              onAddUserUpPressed={this.onAddUserUpPressed.bind(this)}
                              onAddUserDownPressed={this.onAddUserDownPressed.bind(this)}
                              onRemoveUserClicked={this.onRemoveUserClicked.bind(this)}
                />
                { group.name !== "Admin" ? (
                      <DatabasesList group={group} databases={group.databases} />
                ) : null}
            </Permissions>
        );
    }
}
