import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { Component } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import { useListApiKeysQuery } from "metabase/api";
import { AdminContentTable } from "metabase/components/AdminContentTable";
import { AdminPaneLayout } from "metabase/components/AdminPaneLayout";
import Alert from "metabase/components/Alert";
import { ConfirmModal } from "metabase/components/ConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import UserAvatar from "metabase/components/UserAvatar";
import Input from "metabase/core/components/Input";
import Link from "metabase/core/components/Link";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { KEYCODE_ENTER } from "metabase/lib/keyboard";
import { Icon, Menu, UnstyledButton } from "metabase/ui";
import type { ApiKey, Group as IGroup } from "metabase-types/api";

import { AddRow } from "./AddRow";

// ------------------------------------------------------------ Add Group ------------------------------------------------------------

interface AddGroupRowProps {
  text: string;
  onCancelClicked: () => void;
  onCreateClicked: () => void;
  onTextChange: (text: string) => void;
}

function AddGroupRow({
  text,
  onCancelClicked,
  onCreateClicked,
  onTextChange,
}: AddGroupRowProps) {
  const textIsValid = Boolean(text?.trim().length);
  return (
    <tr>
      <td colSpan={3} style={{ padding: 0 }}>
        <AddRow
          value={text}
          isValid={textIsValid}
          placeholder={t`Something like "Marketing"`}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
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

interface DeleteGroupModalProps {
  opened: boolean;
  apiKeys: ApiKey[];
  onConfirm: () => void;
  onClose: () => void;
}

function DeleteGroupModal({
  opened,
  apiKeys,
  onConfirm = () => {},
  onClose = () => {},
}: DeleteGroupModalProps) {
  const apiKeysCount = apiKeys.length;
  const hasApiKeys = apiKeys.length > 0;

  const modalTitle =
    apiKeysCount === 0
      ? t`Remove this group?`
      : apiKeysCount === 1
        ? t`Are you sure you want remove this group and its API key?`
        : t`Are you sure you want remove this group and its API keys?`;

  const message = hasApiKeys
    ? jt`All members of this group will lose any permissions settings they have based on this group, and its related API keys will be deleted. You can ${(
        <Link
          key="link"
          to="/admin/settings/authentication/api-keys"
          variant="brand"
        >{t`move the API keys to another group`}</Link>
      )}.`
    : t`Are you sure? All members of this group will lose any permissions settings they have based on this group.
              This can't be undone.`;

  const confirmButtonText =
    apiKeysCount === 0
      ? t`Remove group`
      : apiKeysCount === 1
        ? t`Remove group and API key`
        : t`Remove group and API keys`;

  return (
    <ConfirmModal
      opened={opened}
      title={modalTitle}
      message={message}
      confirmButtonText={confirmButtonText}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

interface ActionsPopoverProps {
  group: IGroup;
  apiKeys: ApiKey[];
  onEditGroupClicked: (group: IGroup) => void;
  onDeleteGroupClicked: (group: IGroup) => void;
}

function ActionsPopover({
  group,
  apiKeys,
  onEditGroupClicked,
  onDeleteGroupClicked,
}: ActionsPopoverProps) {
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure();

  return (
    <>
      <Menu shadow="md" width={200} position="bottom-end">
        <Menu.Target>
          <UnstyledButton>
            <Icon c="text-light" name="ellipsis" />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => onEditGroupClicked(group)}>
            {t`Edit Name`}
          </Menu.Item>
          <Menu.Item c="danger" onClick={openModal}>
            {t`Remove Group`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <DeleteGroupModal
        opened={modalOpened}
        apiKeys={apiKeys}
        onConfirm={() => onDeleteGroupClicked(group)}
        onClose={closeModal}
      />
    </>
  );
}

interface EditingGroupRowProps {
  group: IGroup;
  textHasChanged: boolean;
  onTextChange: (text: string) => void;
  onCancelClicked: () => void;
  onDoneClicked: () => void;
}

function EditingGroupRow({
  group,
  textHasChanged,
  onTextChange,
  onCancelClicked,
  onDoneClicked,
}: EditingGroupRowProps) {
  const textIsValid = group.name && group.name.length;
  return (
    <tr className={cx(CS.bordered, CS.borderBrand, CS.rounded)}>
      <td>
        <Input
          className={CS.h3}
          type="text"
          autoFocus={true}
          value={group.name}
          onChange={(e) => onTextChange(e.target.value)}
        />
      </td>
      <td />
      <td className={CS.textRight}>
        <span className={CS.link} onClick={onCancelClicked}>{t`Cancel`}</span>
        <button
          className={cx(ButtonsS.Button, CS.ml2, {
            [ButtonsS.ButtonPrimary]: textIsValid && textHasChanged,
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

interface GroupRowProps {
  group: IGroup;
  groupBeingEdited: IGroup | null;
  index: number;
  apiKeys: ApiKey[];
  onEditGroupClicked: (group: IGroup) => void;
  onDeleteGroupClicked: (group: IGroup) => void;
  onEditGroupTextChange: (text: string) => void;
  onEditGroupCancelClicked: () => void;
  onEditGroupDoneClicked: () => void;
}

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
}: GroupRowProps) {
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
          className={cx(CS.link, CS.flex, CS.alignCenter)}
        >
          <span className={CS.textWhite}>
            <UserAvatar
              user={{ first_name: getGroupNameLocalized(group) }}
              bg={backgroundColor}
            />
          </span>
          <span className={cx(CS.ml2, CS.textBold)}>
            {getGroupNameLocalized(group)}
          </span>
        </Link>
      </td>
      <td>
        {group.member_count || 0}
        <ApiKeyCount apiKeys={apiKeys} />
      </td>
      <td className={CS.textRight}>
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

const ApiKeyCount = ({ apiKeys }: { apiKeys: ApiKey[] }) => {
  if (!apiKeys?.length) {
    return null;
  }
  return (
    <span className={CS.textLight}>
      {apiKeys.length === 1
        ? t` (includes 1 API key)`
        : t` (includes ${apiKeys.length} API keys)`}
    </span>
  );
};

const getGroupRowColors = () => [
  color("error"),
  color("accent2"),
  color("brand"),
  color("accent4"),
  color("accent1"),
];

interface GroupsTableProps {
  groups: IGroup[];
  text: string;
  groupBeingEdited: IGroup | null;
  showAddGroupRow: boolean;
  onAddGroupCanceled: () => void;
  onAddGroupCreateButtonClicked: () => void;
  onAddGroupTextChanged: (text: string) => void;
  onEditGroupClicked: (group: IGroup) => void;
  onDeleteGroupClicked: (group: IGroup) => void;
  onEditGroupTextChange: (text: string) => void;
  onEditGroupCancelClicked: () => void;
  onEditGroupDoneClicked: () => void;
}

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
}: GroupsTableProps) {
  const { isLoading, data: apiKeys } = useListApiKeysQuery();

  if (isLoading) {
    return <LoadingAndErrorWrapper loading={isLoading} />;
  }

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
        groups.map((group: IGroup, index: number) => (
          <GroupRow
            key={group.id}
            group={group}
            index={index}
            apiKeys={
              isDefaultGroup(group)
                ? (apiKeys ?? [])
                : (apiKeys?.filter((apiKey) => apiKey.group.id === group.id) ??
                  [])
            }
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

interface GroupsListingProps {
  groups: IGroup[];
  isAdmin: boolean;
  create: (group: { name: string }) => Promise<void>;
  update: (group: { id: number; name: string }) => Promise<void>;
  delete: (group: IGroup) => Promise<void>;
}

interface GroupsListingState {
  text: string;
  showAddGroupRow: boolean;
  groupBeingEdited: IGroup | null;
  alertMessage: string | null;
}

export class GroupsListing extends Component<
  GroupsListingProps,
  GroupsListingState
> {
  constructor(props: GroupsListingProps, context: any) {
    super(props, context);
    this.state = {
      text: "",
      showAddGroupRow: false,
      groupBeingEdited: null,
      alertMessage: null,
    };
  }

  alert(alertMessage: string) {
    this.setState({ alertMessage });
  }

  onAddGroupCanceled() {
    this.setState({
      showAddGroupRow: false,
    });
  }

  // TODO: move this to Redux
  async onAddGroupCreateButtonClicked() {
    try {
      await this.props.create({ name: this.state.text.trim() });
      this.setState({
        showAddGroupRow: false,
        text: "",
      });
    } catch (error: any) {
      console.error("Error creating group:", error);
      if (error.data && typeof error.data === "string") {
        this.alert(error.data);
      }
    }
  }

  onAddGroupTextChanged(newText: string) {
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

  onEditGroupClicked(group: IGroup) {
    this.setState({
      groupBeingEdited: { ...group },
      text: "",
      showAddGroupRow: false,
    });
  }

  onEditGroupTextChange(newText: string) {
    const { groupBeingEdited } = this.state;

    if (!groupBeingEdited) {
      throw new Error("Group being edited not found");
    }

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

    if (!group) {
      throw new Error("There is currently no group being edited");
    }

    const originalGroup = _.findWhere(groups, { id: group.id });

    if (!originalGroup) {
      throw new Error("Original group not found");
    }

    if (!group) {
      throw new Error("Group not found");
    }

    // if name hasn't changed there is nothing to do
    if (originalGroup.name === group.name) {
      this.setState({ groupBeingEdited: null });
    } else {
      // ok, fire off API call to change the group
      try {
        await this.props.update({ id: group.id, name: group.name.trim() });
        this.setState({ groupBeingEdited: null });
      } catch (error: any) {
        console.error("Error updating group name:", error);
        if (error.data && typeof error.data === "string") {
          this.alert(error.data);
        }
      }
    }
  }

  // TODO: move this to Redux
  async onDeleteGroupClicked(group: IGroup) {
    try {
      await this.props.delete(group);
    } catch (error: any) {
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
        buttonText={isAdmin ? t`Create a group` : undefined}
        buttonAction={
          this.state.showAddGroupRow
            ? undefined
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
