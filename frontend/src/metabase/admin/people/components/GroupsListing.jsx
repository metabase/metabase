/* eslint-disable react/prop-types */
import { Component, useState, useEffect } from "react";

import _ from "underscore";
import cx from "classnames";

import { jt, t } from "ttag";
import Link from "metabase/core/components/Link";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { Stack, Text, Group, Button } from "metabase/ui";
import { color } from "metabase/lib/colors";
import {
  isDefaultGroup,
  isAdminGroup,
  getGroupNameLocalized,
} from "metabase/lib/groups";
import { KEYCODE_ENTER } from "metabase/lib/keyboard";
import { ApiKeysApi } from "metabase/services";

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

function DeleteGroupModal({
  group,
  apiKeys,
  onConfirm = () => {},
  onClose = () => {},
}) {
  const numApiKeys = apiKeys.length;
  const hasApiKeys = numApiKeys > 0;
  return (
    <ModalContent
      title={
        numApiKeys === 0
          ? t`Remove this group?`
          : numApiKeys === 1
          ? t`Are you sure you want remove this group and its API Key?`
          : t`Are you sure you want remove this group and its API Keys?`
      }
      onClose={onClose}
    >
      <Stack spacing="xl">
        <Text>
          {hasApiKeys
            ? jt`All members of this group will lose any permissions settings they have based on this group, and its related API Keys will be deleted. You can ${(
                <Link
                  to="/admin/settings/authentication/api-keys"
                  variant="brand"
                >{t`move the API Keys to another group`}</Link>
              )}.`
            : t`Are you sure? All members of this group will lose any permissions settings they have based on this group.
                This can't be undone.`}
        </Text>
        <Group spacing="md" position="right">
          <Button onClick={onClose}>{hasApiKeys ? t`Cancel` : t`No`}</Button>
          <Button
            variant="filled"
            color="error.0"
            onClick={() => {
              onClose();
              onConfirm(group);
            }}
          >
            {hasApiKeys ? t`Remove group and API Key` : t`Yes`}
          </Button>
        </Group>
      </Stack>
    </ModalContent>
  );
}

function ActionsPopover({
  group,
  apiKeys,
  onEditGroupClicked,
  onDeleteGroupClicked,
}) {
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
          <DeleteGroupModal
            group={group}
            apiKeys={apiKeys}
            onConfirm={onDeleteGroupClicked}
          />
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
        >{t`Cancel`}</span>
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
  apiKeys,
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
      <td>
        {group.member_count || 0}
        <span className="text-light">
          {apiKeys.length === 1
            ? t` (Includes 1 API Key)`
            : apiKeys.length > 1
            ? t` (Includes ${apiKeys.length} API Keys)`
            : null}
        </span>
      </td>
      <td className="text-right">
        {showActionsButton ? (
          <ActionsPopover
            group={group}
            apiKeys={apiKeys}
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
  const [apiKeys, setApiKeys] = useState([]);

  useEffect(() => {
    ApiKeysApi.list().then(setApiKeys);
  }, []);

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
            apiKeys={apiKeys.filter(apiKey => apiKey.group_id === group.id)}
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
