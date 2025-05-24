import { useDisclosure } from "@mantine/hooks";
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
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { KEYCODE_ENTER } from "metabase/lib/keyboard";
import { regexpEscape } from "metabase/lib/string";
import {
  Box,
  Button,
  Flex,
  Icon,
  Input,
  Menu,
  UnstyledButton,
} from "metabase/ui";
import type { ApiKey, GroupInfo } from "metabase-types/api";

import { groupIdToColor } from "../colors";

import { AddRow } from "./AddRow";
import { SearchFilter } from "./SearchFilter";

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
  group: GroupInfo;
  apiKeys: ApiKey[];
  onEditGroupClicked: (group: GroupInfo) => void;
  onDeleteGroupClicked: (group: GroupInfo) => void;
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
  group: GroupInfo;
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
    <Box component="tr" bd="1px solid var(--mb-color-brand)">
      <td>
        <Input
          fz="lg"
          type="text"
          autoFocus
          value={group.name}
          onChange={(e) => onTextChange(e.target.value)}
        />
      </td>
      <td />
      <Box component="td" ta="right">
        <Button variant="subtle" onClick={onCancelClicked}>{t`Cancel`}</Button>
        <Button
          ml="1rem"
          variant={textIsValid && textHasChanged ? "filled" : "outline"}
          disabled={!textIsValid || !textHasChanged}
          onClick={onDoneClicked}
        >
          {t`Done`}
        </Button>
      </Box>
    </Box>
  );
}

// ------------------------------------------------------------ Groups Table: not editing ------------------------------------------------------------

interface GroupRowProps {
  group: GroupInfo;
  groupBeingEdited: GroupInfo | null;
  apiKeys: ApiKey[];
  onEditGroupClicked: (group: GroupInfo) => void;
  onDeleteGroupClicked: (group: GroupInfo) => void;
  onEditGroupTextChange: (text: string) => void;
  onEditGroupCancelClicked: () => void;
  onEditGroupDoneClicked: () => void;
}

function GroupRow({
  group,
  groupBeingEdited,
  apiKeys,
  onEditGroupClicked,
  onDeleteGroupClicked,
  onEditGroupTextChange,
  onEditGroupCancelClicked,
  onEditGroupDoneClicked,
}: GroupRowProps) {
  const backgroundColor = groupIdToColor(group.id);
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
        <Flex
          component={Link}
          align="center"
          to={"/admin/people/groups/" + group.id}
          className={CS.link}
          gap="md"
        >
          <UserAvatar
            user={{ first_name: getGroupNameLocalized(group) }}
            bg={backgroundColor}
          />
          <Box component="span" fw={700} c="brand">
            {getGroupNameLocalized(group)}
          </Box>
        </Flex>
      </td>
      <td>
        {group.member_count || 0}
        <ApiKeyCount apiKeys={apiKeys} />
      </td>
      <Box component="td" ta="end">
        {showActionsButton ? (
          <ActionsPopover
            group={group}
            apiKeys={apiKeys}
            onEditGroupClicked={onEditGroupClicked}
            onDeleteGroupClicked={onDeleteGroupClicked}
          />
        ) : null}
      </Box>
    </tr>
  );
}

const ApiKeyCount = ({ apiKeys }: { apiKeys: ApiKey[] }) => {
  if (!apiKeys?.length) {
    return null;
  }
  return (
    <Box component="span" c="text-light">
      {apiKeys.length === 1
        ? t` (includes 1 API key)`
        : t` (includes ${apiKeys.length} API keys)`}
    </Box>
  );
};

interface GroupsTableProps {
  groups: GroupInfo[];
  text: string;
  groupBeingEdited: GroupInfo | null;
  showAddGroupRow: boolean;
  onAddGroupCanceled: () => void;
  onAddGroupCreateButtonClicked: () => void;
  onAddGroupTextChanged: (text: string) => void;
  onEditGroupClicked: (group: GroupInfo) => void;
  onDeleteGroupClicked: (group: GroupInfo) => void;
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
        groups.map((group: GroupInfo) => (
          <GroupRow
            key={group.id}
            group={group}
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
  groups: GroupInfo[];
  isAdmin: boolean;
  create: (group: { name: string }) => Promise<void>;
  update: (group: { id: number; name: string }) => Promise<void>;
  delete: (group: GroupInfo, groupCount: number) => Promise<void>;
}

interface GroupsListingState {
  text: string;
  showAddGroupRow: boolean;
  groupBeingEdited: GroupInfo | null;
  alertMessage: string | null;
  searchInputValue: string;
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
      searchInputValue: "",
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

  onEditGroupClicked(group: GroupInfo) {
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

  async onDeleteGroupClicked(groups: GroupInfo[], group: GroupInfo) {
    try {
      await this.props.delete(group, groups.length);
    } catch (error: any) {
      console.error("Error deleting group: ", error);
      if (error.data && typeof error.data === "string") {
        this.alert(error.data);
      }
    }
  }

  updateSearchInputValue(value: string) {
    this.setState({ searchInputValue: value });
  }

  render() {
    const { groups, isAdmin } = this.props;
    const { alertMessage, searchInputValue } = this.state;

    const groupNameFilter = new RegExp(
      `\\b${regexpEscape(searchInputValue)}`,
      "i",
    );
    const filteredGroups = groups.filter((g) => groupNameFilter.test(g.name));

    return (
      <AdminPaneLayout
        title={t`Groups`}
        titleActions={
          isAdmin &&
          !this.state.showAddGroupRow && (
            <Button
              variant="filled"
              onClick={this.onCreateAGroupButtonClicked.bind(this)}
            >{t`Create a group`}</Button>
          )
        }
        description={t`You can use groups to control your users' access to your data. Put users in groups and then go to the Permissions section to control each group's access. The Administrators and All Users groups are special default groups that can't be removed.`}
        headerContent={
          <SearchFilter
            value={this.state.searchInputValue}
            onChange={this.updateSearchInputValue.bind(this)}
            placeholder={t`Find a group`}
          />
        }
      >
        <GroupsTable
          groups={filteredGroups}
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
          onDeleteGroupClicked={(group) =>
            this.onDeleteGroupClicked(groups, group)
          }
        />
        <Alert
          message={alertMessage}
          onClose={() => this.setState({ alertMessage: null })}
        />
      </AdminPaneLayout>
    );
  }
}
