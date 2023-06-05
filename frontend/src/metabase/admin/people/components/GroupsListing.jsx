/* eslint-disable react/prop-types */
import { Component } from "react";
import { Link } from "react-router";

import _ from "underscore";
import cx from "classnames";

import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import {
  isDefaultGroup,
  isAdminGroup,
  getGroupNameLocalized,
} from "metabase/lib/groups";
import { KEYCODE_ENTER } from "metabase/lib/keyboard";

import { Icon } from "metabase/core/components/Icon";
import Input from "metabase/core/components/Input";
import ModalContent from "metabase/components/ModalContent";
import Alert from "metabase/components/Alert";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import UserAvatar from "metabase/components/UserAvatar";

import AdminContentTable from "metabase/components/AdminContentTable";
import AdminPaneLayout from "metabase/components/AdminPaneLayout";

import { AddRow } from "./AddRow";
import { DeleteModalTrigger, EditGroupButton } from "./GroupsListing.styled";

// ------------------------------------------------------------ Add Group ------------------------------------------------------------

function AddGroupRow({ text, onCancelClicked, onCreateClicked, onTextChange }) {
  const textIsValid = text?.trim().length;
  return (
    <tr>
      <td colSpan="3" style={{ padding: 0 }}>
        <AddRow
          value={text}
          isValid={textIsValid}
          placeholder={t`Something like "Marketing"`}
          onChange={e => onTextChange(e.target.value)}
          onKeyDown={e => {
            if (e.keyCode === KEYCODE_ENTER) {
              onCreateClicked();
            }
          }}
          onDone={onCreateClicked}
          onCancel={onCancelClicked}
        />
      </td>
    </tr>
  );
}

// ------------------------------------------------------------ Groups Table: editing ------------------------------------------------------------

function DeleteGroupModal({ group, onConfirm = () => {}, onClose = () => {} }) {
  return (
    <ModalContent title={t`Remove this group?`} onClose={onClose}>
      <p className="px4 pb4">
        {t`Are you sure? All members of this group will lose any permissions settings they have based on this group.
                This can't be undone.`}
      </p>
      <div className="Form-actions">
        <button
          className="Button Button--danger"
          onClick={() => {
            onClose();
            onConfirm(group);
          }}
        >
          {t`Yes`}
        </button>
        <button className="Button ml1" onClick={onClose}>
          {t`No`}
        </button>
      </div>
    </ModalContent>
  );
}

function ActionsPopover({ group, onEditGroupClicked, onDeleteGroupClicked }) {
  return (
    <PopoverWithTrigger
      className="block"
      triggerElement={<Icon className="text-light" name="ellipsis" />}
    >
      <ul className="UserActionsSelect py1">
        <EditGroupButton onClick={onEditGroupClicked.bind(null, group)}>
          {t`Edit Name`}
        </EditGroupButton>
        <ModalWithTrigger
          as={DeleteModalTrigger}
          triggerElement={t`Remove Group`}
        >
          <DeleteGroupModal group={group} onConfirm={onDeleteGroupClicked} />
        </ModalWithTrigger>
      </ul>
    </PopoverWithTrigger>
  );
}

function EditingGroupRow({
  group,
  textHasChanged,
  onTextChange,
  onCancelClicked,
  onDoneClicked,
}) {
  const textIsValid = group.name && group.name.length;
  return (
    <tr className="bordered border-brand rounded">
      <td>
        <Input
          className="h3"
          type="text"
          autoFocus={true}
          value={group.name}
          onChange={e => onTextChange(e.target.value)}
        />
      </td>
      <td />
      <td className="text-right">
        <span
          className="link no-decoration cursor-pointer"
          onClick={onCancelClicked}
        >
          Cancel
        </span>
        <button
          className={cx("Button ml2", {
            "Button--primary": textIsValid && textHasChanged,
          })}
          disabled={!textIsValid || !textHasChanged}
          onClick={onDoneClicked}
        >
          {t`Done`}
        </button>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------ Groups Table: not editing ------------------------------------------------------------

function GroupRow({
  group,
  groupBeingEdited,
  index,
  onEditGroupClicked,
  onDeleteGroupClicked,
  onEditGroupTextChange,
  onEditGroupCancelClicked,
  onEditGroupDoneClicked,
}) {
  const colors = getGroupRowColors();
  const backgroundColor = colors[index % colors.length];
  const showActionsButton = !isDefaultGroup(group) && !isAdminGroup(group);
  const editing = groupBeingEdited && groupBeingEdited.id === group.id;

  return editing ? (
    <EditingGroupRow
      group={groupBeingEdited}
      textHasChanged={group.name !== groupBeingEdited.name}
      onTextChange={onEditGroupTextChange}
      onCancelClicked={onEditGroupCancelClicked}
      onDoneClicked={onEditGroupDoneClicked}
    />
  ) : (
    <tr>
      <td>
        <Link
          to={"/admin/people/groups/" + group.id}
          className="link no-decoration flex align-center"
        >
          <span className="text-white">
            <UserAvatar
              user={{ first_name: getGroupNameLocalized(group) }}
              bg={backgroundColor}
            />
          </span>
          <span className="ml2 text-bold">{getGroupNameLocalized(group)}</span>
        </Link>
      </td>
      <td>{group.member_count || 0}</td>
      <td className="text-right">
        {showActionsButton ? (
          <ActionsPopover
            group={group}
            onEditGroupClicked={onEditGroupClicked}
            onDeleteGroupClicked={onDeleteGroupClicked}
          />
        ) : null}
      </td>
    </tr>
  );
}

const getGroupRowColors = () => [
  color("error"),
  color("accent2"),
  color("brand"),
  color("accent4"),
  color("accent1"),
];

function GroupsTable({
  groups,
  text,
  groupBeingEdited,
  showAddGroupRow,
  onAddGroupCanceled,
  onAddGroupCreateButtonClicked,
  onAddGroupTextChanged,
  onEditGroupClicked,
  onDeleteGroupClicked,
  onEditGroupTextChange,
  onEditGroupCancelClicked,
  onEditGroupDoneClicked,
}) {
  return (
    <AdminContentTable columnTitles={[t`Group name`, t`Members`]}>
      {showAddGroupRow ? (
        <AddGroupRow
          text={text}
          onCancelClicked={onAddGroupCanceled}
          onCreateClicked={onAddGroupCreateButtonClicked}
          onTextChange={onAddGroupTextChanged}
        />
      ) : null}
      {groups &&
        groups.map((group, index) => (
          <GroupRow
            key={group.id}
            group={group}
            index={index}
            groupBeingEdited={groupBeingEdited}
            onEditGroupClicked={onEditGroupClicked}
            onDeleteGroupClicked={onDeleteGroupClicked}
            onEditGroupTextChange={onEditGroupTextChange}
            onEditGroupCancelClicked={onEditGroupCancelClicked}
            onEditGroupDoneClicked={onEditGroupDoneClicked}
          />
        ))}
    </AdminContentTable>
  );
}

// ------------------------------------------------------------ Logic ------------------------------------------------------------

export default class GroupsListing extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      text: "",
      showAddGroupRow: false,
      groupBeingEdited: null,
      alertMessage: null,
    };
  }

  alert(alertMessage) {
    this.setState({ alertMessage });
  }

  onAddGroupCanceled() {
    this.setState({
      showAddGroupRow: false,
    });
  }

  // TODO: move this to Redux
  async onAddGroupCreateButtonClicked() {
    MetabaseAnalytics.trackStructEvent("People Groups", "Group Added");

    try {
      await this.props.create({ name: this.state.text.trim() });
      this.setState({
        showAddGroupRow: false,
        text: "",
      });
    } catch (error) {
      console.error("Error creating group:", error);
      if (error.data && typeof error.data === "string") {
        this.alert(error.data);
      }
    }
  }

  onAddGroupTextChanged(newText) {
    this.setState({
      text: newText,
    });
  }

  onCreateAGroupButtonClicked() {
    this.setState({
      text: "",
      showAddGroupRow: true,
      groupBeingEdited: null,
    });
  }

  onEditGroupClicked(group) {
    this.setState({
      groupBeingEdited: { ...group },
      text: "",
      showAddGroupRow: false,
    });
  }

  onEditGroupTextChange(newText) {
    const { groupBeingEdited } = this.state;
    this.setState({
      groupBeingEdited: { ...groupBeingEdited, name: newText },
    });
  }

  onEditGroupCancelClicked() {
    this.setState({
      groupBeingEdited: null,
    });
  }

  async onEditGroupDoneClicked() {
    const { groups } = this.props;
    const group = this.state.groupBeingEdited;
    const originalGroup = _.findWhere(groups, { id: group.id });

    // if name hasn't changed there is nothing to do
    if (originalGroup.name === group.name) {
      this.setState({ groupBeingEdited: null });
    } else {
      // ok, fire off API call to change the group
      MetabaseAnalytics.trackStructEvent("People Groups", "Group Updated");
      try {
        await this.props.update({ id: group.id, name: group.name.trim() });
        this.setState({ groupBeingEdited: null });
      } catch (error) {
        console.error("Error updating group name:", error);
        if (error.data && typeof error.data === "string") {
          this.alert(error.data);
        }
      }
    }
  }

  // TODO: move this to Redux
  async onDeleteGroupClicked(group) {
    MetabaseAnalytics.trackStructEvent("People Groups", "Group Deleted");
    try {
      await this.props.delete(group);
    } catch (error) {
      console.error("Error deleting group: ", error);
      if (error.data && typeof error.data === "string") {
        this.alert(error.data);
      }
    }
  }

  render() {
    const { groups, isAdmin } = this.props;
    const { alertMessage } = this.state;

    return (
      <AdminPaneLayout
        title={t`Groups`}
        buttonText={isAdmin ? t`Create a group` : null}
        buttonAction={
          this.state.showAddGroupRow
            ? null
            : this.onCreateAGroupButtonClicked.bind(this)
        }
        description={t`You can use groups to control your users' access to your data. Put users in groups and then go to the Permissions section to control each group's access. The Administrators and All Users groups are special default groups that can't be removed.`}
      >
        <GroupsTable
          groups={groups}
          text={this.state.text}
          showAddGroupRow={this.state.showAddGroupRow}
          groupBeingEdited={this.state.groupBeingEdited}
          onAddGroupCanceled={this.onAddGroupCanceled.bind(this)}
          onAddGroupCreateButtonClicked={this.onAddGroupCreateButtonClicked.bind(
            this,
          )}
          onAddGroupTextChanged={this.onAddGroupTextChanged.bind(this)}
          onEditGroupClicked={this.onEditGroupClicked.bind(this)}
          onEditGroupTextChange={this.onEditGroupTextChange.bind(this)}
          onEditGroupCancelClicked={this.onEditGroupCancelClicked.bind(this)}
          onEditGroupDoneClicked={this.onEditGroupDoneClicked.bind(this)}
          onDeleteGroupClicked={this.onDeleteGroupClicked.bind(this)}
        />
        <Alert
          message={alertMessage}
          onClose={() => this.setState({ alertMessage: null })}
        />
      </AdminPaneLayout>
    );
  }
}
