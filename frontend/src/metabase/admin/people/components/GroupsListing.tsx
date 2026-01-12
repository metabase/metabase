import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import { useListApiKeysQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { AdminPaneLayout } from "metabase/common/components/AdminPaneLayout";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import Link from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import UserAvatar from "metabase/common/components/UserAvatar";
import CS from "metabase/css/core/index.css";
import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { KEYCODE_ENTER } from "metabase/lib/keyboard";
import { regexpEscape } from "metabase/lib/string";
import { PLUGIN_TENANTS } from "metabase/plugins";
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
          <UnstyledButton aria-label={`group-action-button`}>
            <Icon c="text-tertiary" name="ellipsis" />
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
  const showActionsButton =
    !isDefaultGroup(group) &&
    !isAdminGroup(group) &&
    !PLUGIN_TENANTS.isExternalUsersGroup(group);
  const editing = groupBeingEdited && groupBeingEdited.id === group.id;

  const isTenantGroup = PLUGIN_TENANTS.isTenantGroup(group);

  const membersLink = isTenantGroup
    ? `/admin/people/tenants/groups/${group.id}`
    : `/admin/people/groups/${group.id}`;

  return editing ? (
    <EditingGroupRow
      group={groupBeingEdited}
      textHasChanged={group.name !== groupBeingEdited.name}
      onTextChange={onEditGroupTextChange}
      onCancelClicked={onEditGroupCancelClicked}
      onDoneClicked={onEditGroupDoneClicked}
    />
  ) : (
    <tr aria-label={`group-${group.id}-row`}>
      <td>
        <Flex
          component={Link}
          align="center"
          to={membersLink}
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
      <td aria-label="member-count">
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
    <Box component="span" c="text-tertiary">
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
  description?: string;
}

export const GroupsListing = (props: GroupsListingProps) => {
  const [searchText, setSearchText] = useState("");
  const [text, setText] = useState("");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [groupBeingEdited, setGroupBeingEdited] = useState<GroupInfo | null>(
    null,
  );
  const [
    isShowingAddGroupRow,
    { open: showAddGroupRow, close: hideAddGroupRow },
  ] = useDisclosure(false);

  const onAddGroupCanceled = () => {
    hideAddGroupRow();
  };

  const onDismissAlert = () => {
    setAlertMessage(null);
  };

  const onAddGroupCreateButtonClicked = async () => {
    const { create } = props;
    try {
      await create({ name: text.trim() });
      hideAddGroupRow();
      setText("");
    } catch (error: any) {
      console.error("Error creating group:", error);
      if (error.data) {
        const errorMessage = getErrorMessage(error);
        setAlertMessage(errorMessage);
      }
    }
  };

  const onCreateAGroupButtonClicked = () => {
    setText("");
    showAddGroupRow();
    setGroupBeingEdited(null);
  };

  const onEditGroupClicked = (group: GroupInfo) => {
    setGroupBeingEdited({ ...group });
    setText("");
    hideAddGroupRow();
  };

  const onEditGroupTextChange = (newText: string) => {
    if (!groupBeingEdited) {
      throw new Error("Group being edited not found");
    }

    setGroupBeingEdited({ ...groupBeingEdited, name: newText });
  };

  const onEditGroupCancelClicked = () => {
    setGroupBeingEdited(null);
  };

  const onEditGroupDoneClicked = async () => {
    const { groups, update } = props;
    const group = groupBeingEdited;

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
      setGroupBeingEdited(null);
    } else {
      // ok, fire off API call to change the group
      try {
        await update({ id: group.id, name: group.name.trim() });
        setGroupBeingEdited(null);
      } catch (error: any) {
        console.error("Error updating group name:", error);
        const errorMessage = getErrorMessage(error);

        setAlertMessage(errorMessage);
      }
    }
  };

  const onDeleteGroupClicked = async (
    groups: GroupInfo[],
    group: GroupInfo,
  ) => {
    try {
      await props.delete(group, groups.length);
    } catch (error: any) {
      console.error("Error deleting group: ", error);
      const errorMessage = getErrorMessage(error);

      setAlertMessage(errorMessage);
    }
  };

  const { groups, isAdmin } = props;

  const groupNameFilter = new RegExp(`\\b${regexpEscape(searchText)}`, "i");
  const filteredGroups = groups.filter((g) => groupNameFilter.test(g.name));

  return (
    <AdminPaneLayout
      headerContent={
        <SearchFilter
          value={searchText}
          onChange={setSearchText}
          placeholder={t`Find a group`}
        />
      }
      titleActions={
        isAdmin &&
        !isShowingAddGroupRow && (
          <Button
            variant="filled"
            onClick={onCreateAGroupButtonClicked}
            flex="0 1 140px"
          >{t`Create a group`}</Button>
        )
      }
      description={
        props.description ??
        t`You can use groups to control your users' access to your data. Put users in groups and then go to the Permissions section to control each group's access. The Administrators and All Users groups are special default groups that can't be removed.`
      }
    >
      <GroupsTable
        groups={filteredGroups}
        text={text}
        showAddGroupRow={isShowingAddGroupRow}
        groupBeingEdited={groupBeingEdited}
        onAddGroupCanceled={onAddGroupCanceled}
        onAddGroupCreateButtonClicked={onAddGroupCreateButtonClicked}
        onAddGroupTextChanged={setText}
        onEditGroupClicked={onEditGroupClicked}
        onEditGroupTextChange={onEditGroupTextChange}
        onEditGroupCancelClicked={onEditGroupCancelClicked}
        onEditGroupDoneClicked={onEditGroupDoneClicked}
        onDeleteGroupClicked={(group) => onDeleteGroupClicked(groups, group)}
      />
      <ConfirmModal
        onClose={onDismissAlert}
        onConfirm={onDismissAlert}
        opened={!!alertMessage}
        message={alertMessage}
        closeButtonText={null}
        withCloseButton={false}
        confirmButtonText={t`Ok`}
        confirmButtonProps={{ color: "brand" }}
        data-testid="alert-modal"
      />
    </AdminPaneLayout>
  );
};
