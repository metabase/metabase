import React, { Component } from "react";
import { Link } from "react-router";

import _ from "underscore";
import cx from "classnames";

import { AngularResourceProxy } from "metabase/lib/redux";

import Icon from "metabase/components/Icon.jsx";
import Input from "metabase/components/Input.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import UserAvatar from "metabase/components/UserAvatar.jsx";

import AdminContentTable from "./AdminContentTable.jsx";
import Permissions from "./Permissions.jsx";
import TopLevelLeftNavPane from "./TopLevelLeftNavPane.jsx";


const PermissionsAPI = new AngularResourceProxy("Permissions", ["createGroup", "deleteGroup", "updateGroup"]);


// ------------------------------------------------------------ Add Group ------------------------------------------------------------

function AddGroupRow({ text, onCancelClicked, onCreateClicked, onTextChange }) {
    const textIsValid = text && text.length;
    return (
        <tr className="bordered border-brand rounded">
            <td>
                <Input className="AdminInput h3" type="text" placeholder="Justice League" autoFocus={true} value={text}
                       onChange={(e) => onTextChange(e.target.value)}
                />
            </td>
            <td />
            <td className="text-right">
                <span className="link no-decoration cursor-pointer" onClick={onCancelClicked}>
                    Cancel
                </span>
                <button className={cx("Button ml2", {"Button--primary": textIsValid})} disabled={!textIsValid} onClick={onCreateClicked}>
                    Create
                </button>
            </td>
        </tr>
    );
}


// ------------------------------------------------------------ Groups Table: editing ------------------------------------------------------------

function DeleteGroupModal({ group, onConfirm, onClose }) {
    return (
        <ModalContent title="Remove this group?" closeFn={onClose}>
            <p className="px4 pb4">
                Are you sure? All members of this group will lose any permissions settings the have based on this group.
                This can't be undone.
            </p>
            <div className="Form-actions">
                <button className="Button Button--danger" onClick={onConfirm.bind(null, group)}>
                    Yes
                </button>
                <button className="Button Button--primary ml1" onClick={onClose}>
                    No
                </button>
            </div>
        </ModalContent>
    );
}

function ActionsPopover({ group, onEditGroupClicked, onDeleteGroupClicked }) {
    return (
        <PopoverWithTrigger className="block" triggerElement={<Icon className="text-grey-1" name="ellipsis" />}>
            <ul className="UserActionsSelect">
                <li className="pt1 pb2 px2 bg-brand-hover text-white-hover cursor-pointer" onClick={onEditGroupClicked.bind(null, group)}>
                    Edit Name
                </li>
                <li className="pt1 pb2 px2 bg-brand-hover text-white-hover cursor-pointer text-error">
                    <ModalWithTrigger triggerElement="Remove Group">
                        <DeleteGroupModal group={group} onConfirm={onDeleteGroupClicked} />
                    </ModalWithTrigger>
                </li>
            </ul>
        </PopoverWithTrigger>
    )
}

function EditingGroupRow({ group, textHasChanged, onTextChange, onCancelClicked, onDoneClicked }) {
    const textIsValid = group.name && group.name.length;
    return (
        <tr className="bordered border-brand rounded">
            <td>
                <Input className="AdminInput h3" type="text" autoFocus={true} value={group.name}
                       onChange={(e) => onTextChange(e.target.value)}
                />
            </td>
            <td />
            <td className="text-right">
                <span className="link no-decoration cursor-pointer" onClick={onCancelClicked}>
                    Cancel
                </span>
                <button className={cx("Button ml2", {"Button--primary": textIsValid && textHasChanged})} disabled={!textIsValid || !textHasChanged} onClick={onDoneClicked}>
                    Done
                </button>
            </td>
        </tr>
    )
}


// ------------------------------------------------------------ Groups Table: not editing ------------------------------------------------------------

const COLORS = ['bg-error', 'bg-purple', 'bg-brand', 'bg-gold', 'bg-green'];

function GroupRow({ group, groupBeingEdited, index, showGroupDetail, showAddGroupRow, onEditGroupClicked, onDeleteGroupClicked,
                    onEditGroupTextChange, onEditGroupCancelClicked, onEditGroupDoneClicked }) {
    const color  = COLORS[(index % COLORS.length)];
    const showActionsButton = group.name !== "Default" && group.name !== "Admin";
    const editing = groupBeingEdited && groupBeingEdited.id === group.id;

    return editing ? (
        <EditingGroupRow group={groupBeingEdited} textHasChanged={group.name !== groupBeingEdited.name} onTextChange={onEditGroupTextChange}
                         onCancelClicked={onEditGroupCancelClicked} onDoneClicked={onEditGroupDoneClicked}
        />
    ) : (
        <tr>
            <td>
                <Link to={"/admin/permissions/groups/" + group.id} className="link no-decoration">
                    <span className="text-white inline-block">
                        <UserAvatar background={color} user={{first_name: group.name}} />
                    </span>
                    <span className="ml2 text-bold">
                        {group.name}
                    </span>
                </Link>
            </td>
            <td>
                {group.members || 0}
            </td>
            <td className="text-right">
                {showActionsButton ? (
                     <ActionsPopover group={group} onEditGroupClicked={onEditGroupClicked} onDeleteGroupClicked={onDeleteGroupClicked} />
                 ) : null}
            </td>
        </tr>
    );
}

function GroupsTable({ groups, text, groupBeingEdited, showAddGroupRow, onAddGroupCanceled, onAddGroupCreateButtonClicked, onAddGroupTextChanged,
                       onEditGroupClicked, onDeleteGroupClicked, onEditGroupTextChange, onEditGroupCancelClicked, onEditGroupDoneClicked }) {

    return (
        <AdminContentTable columnTitles={["Group name", "Members"]}>
            {showAddGroupRow ? (
                 <AddGroupRow text={text} onCancelClicked={onAddGroupCanceled} onCreateClicked={onAddGroupCreateButtonClicked} onTextChange={onAddGroupTextChanged} />
             ) : null}
            {groups && groups.map((group, index) =>
                <GroupRow key={group.id} group={group} index={index} groupBeingEdited={groupBeingEdited}
                          onEditGroupClicked={onEditGroupClicked}
                          onDeleteGroupClicked={onDeleteGroupClicked}
                          onEditGroupTextChange={onEditGroupTextChange}
                          onEditGroupCancelClicked={onEditGroupCancelClicked}
                          onEditGroupDoneClicked={onEditGroupDoneClicked}
                />
             )}
        </AdminContentTable>
    );
}


// ------------------------------------------------------------ Logic ------------------------------------------------------------

function sortGroups(groups) {
    return _.sortBy(groups, (group) => group.name && group.name.toLowerCase());
}

export default class GroupsListing extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            text: "",
            showAddGroupRow: false,
            groups: null,
            groupBeingEdited: null
        };
    }

    onAddGroupCanceled() {
        this.setState({
            showAddGroupRow: false
        });
    }

    onAddGroupCreateButtonClicked() {
        PermissionsAPI.createGroup({name: this.state.text}).then((function(newGroup) {
            const groups = this.state.groups || this.props.groups || [];
            const newGroups = sortGroups(_.union(groups, [newGroup]));

            this.setState({
                groups: newGroups,
                showAddGroupRow: false,
                text: ""
            });
        }).bind(this), function(error) {
            console.error('Error creating group:', error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    onAddGroupTextChanged(newText) {
        this.setState({
            text: newText
        });
    }

    onCreateAGroupButtonClicked() {
        this.setState({
            text: "",
            showAddGroupRow: true,
            groupBeingEdited: null
        });
    }

    onEditGroupClicked(group) {
        this.setState({
            groupBeingEdited: _.clone(group),
            text: "",
            showAddGroupRow: false
        });
    }

    onEditGroupTextChange(newText) {
        let groupBeingEdited = this.state.groupBeingEdited;
        groupBeingEdited.name = newText;

        this.setState({
            groupBeingEdited: groupBeingEdited
        });
    }

    onEditGroupCancelClicked() {
        this.setState({
            groupBeingEdited: null
        });
    }

    onEditGroupDoneClicked() {
        const groups = this.state.groups || this.props.groups || [];
        const originalGroup = _.findWhere(groups, {id: this.state.groupBeingEdited.id});
        const group = this.state.groupBeingEdited;

        // if name hasn't changed there is nothing to do
        if (originalGroup.name === group.name) {
            this.setState({
                groupBeingEdited: null
            });
            return;
        }

        // ok, fire off API call to change the group
        PermissionsAPI.updateGroup({id: group.id, name: group.name}).then((function (newGroup) {
            // now replace the original group with the new group and update state
            let newGroups = _.reject(groups, (g) => g.id === group.id);
            newGroups = sortGroups(_.union(newGroups, [newGroup]));

            this.setState({
                groups: newGroups,
                groupBeingEdited: null
            });

        }).bind(this), function(error) {
            console.error("Error updating group name:", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    onDeleteGroupClicked(group) {
        const groups = this.state.groups || this.props.groups || [];
        PermissionsAPI.deleteGroup({id: group.id}).then((function () {
            const newGroups = sortGroups(_.reject(groups, (g) => g.id === group.id));
            this.setState({
                groups: newGroups
            });
        }).bind(this), function(error) {
            console.error("Error deleting group: ", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    render() {
        let { location: { pathname }, groups } = this.props;
        groups = this.state.groups || groups || [];

        return (
            <Permissions leftNavPane={<TopLevelLeftNavPane currentPath={pathname} />}
                         rightTitleButtonTitle="Create a group"
                         rightTitleButtonAction={this.state.showAddGroupRow ? null : this.onCreateAGroupButtonClicked.bind(this)}
            >
                <GroupsTable groups={groups} text={this.state.text} showAddGroupRow={this.state.showAddGroupRow} groupBeingEdited={this.state.groupBeingEdited}
                             onAddGroupCanceled={this.onAddGroupCanceled.bind(this)}
                             onAddGroupCreateButtonClicked={this.onAddGroupCreateButtonClicked.bind(this)}
                             onAddGroupTextChanged={this.onAddGroupTextChanged.bind(this)}
                             onEditGroupClicked={this.onEditGroupClicked.bind(this)}
                             onEditGroupTextChange={this.onEditGroupTextChange.bind(this)}
                             onEditGroupCancelClicked={this.onEditGroupCancelClicked.bind(this)}
                             onEditGroupDoneClicked={this.onEditGroupDoneClicked.bind(this)}
                             onDeleteGroupClicked={this.onDeleteGroupClicked.bind(this)}
                />
            </Permissions>
        );
    }
}
