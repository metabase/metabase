import { useMemo, useState } from "react";
import { t } from "ttag";

import { useAddAnalystMutation, useListUsersQuery } from "metabase/api";
import UserAvatar from "metabase/common/components/UserAvatar";
import { useToast } from "metabase/common/hooks";
import { getFullName } from "metabase/lib/user";
import {
  Box,
  Button,
  Center,
  Combobox,
  FixedSizeIcon,
  Flex,
  FocusTrap,
  Group,
  Modal,
  Pill,
  PillsInput,
  ScrollArea,
  Stack,
  Text,
  Title,
  useCombobox,
} from "metabase/ui";
import type { User } from "metabase-types/api";

type InviteAnalystsModalProps = {
  isOpen: boolean;
  existingAnalystIds: Set<number>;
  onClose: () => void;
};

export function InviteAnalystsModal({
  isOpen,
  existingAnalystIds,
  onClose,
}: InviteAnalystsModalProps) {
  const [sendToast] = useToast();
  const { data: usersData, isLoading: isLoadingUsers } = useListUsersQuery();
  const [addAnalyst, { isLoading: isAddingAnalyst }] = useAddAnalystMutation();

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const [searchText, setSearchText] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  const availableUsers = useMemo(() => {
    if (isLoadingUsers || !usersData?.data) {
      return [];
    }
    const selectedIds = new Set(selectedUsers.map((u) => u.id));
    return usersData.data.filter(
      (user) => !existingAnalystIds.has(user.id) && !selectedIds.has(user.id),
    );
  }, [usersData, existingAnalystIds, selectedUsers, isLoadingUsers]);

  const filteredUsers = useMemo(() => {
    const search = searchText.toLowerCase();
    const users = search
      ? availableUsers.filter(
          (user) =>
            (user.common_name || "").toLowerCase().includes(search) ||
            (user.email || "").toLowerCase().includes(search),
        )
      : availableUsers;
    return users.slice(0, 10);
  }, [availableUsers, searchText]);

  const handleSelectUser = (userId: string) => {
    const user = availableUsers.find((u) => String(u.id) === userId);
    if (user) {
      setSelectedUsers([...selectedUsers, user]);
      setSearchText("");
    }
  };

  const handleRemoveUser = (userId: number) => {
    setSelectedUsers(selectedUsers.filter((u) => u.id !== userId));
  };

  const handleInvite = async () => {
    try {
      await Promise.all(
        selectedUsers.map((user) => addAnalyst(user.id).unwrap()),
      );
      sendToast({
        message:
          selectedUsers.length === 1 ? t`Analyst added` : t`Analysts added`,
      });
      handleClose();
    } catch {
      sendToast({ message: t`Failed to add analysts` });
    }
  };

  const handleClose = () => {
    setSearchText("");
    setSelectedUsers([]);
    onClose();
  };

  return (
    <Modal
      title={<ModalTitle />}
      opened={isOpen}
      onClose={handleClose}
      size="lg"
    >
      <FocusTrap.InitialFocus />
      <Stack gap="md">
        <Text c="text-secondary">
          {t`Select people from your organization to add them as analysts.`}
        </Text>

        <Combobox
          store={combobox}
          onOptionSubmit={handleSelectUser}
          withinPortal
        >
          <Combobox.DropdownTarget>
            <PillsInput onClick={() => combobox.openDropdown()}>
              <Pill.Group>
                {selectedUsers.map((user) => (
                  <Pill
                    key={user.id}
                    withRemoveButton
                    onRemove={() => handleRemoveUser(user.id)}
                  >
                    {getFullName(user) || user.email}
                  </Pill>
                ))}
                <Combobox.EventsTarget>
                  <PillsInput.Field
                    value={searchText}
                    placeholder={
                      selectedUsers.length === 0
                        ? t`Search by name or email`
                        : undefined
                    }
                    onChange={(e) => {
                      setSearchText(e.currentTarget.value);
                      combobox.openDropdown();
                      combobox.updateSelectedOptionIndex();
                    }}
                    onFocus={() => combobox.openDropdown()}
                    onBlur={() => combobox.closeDropdown()}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Backspace" &&
                        searchText.length === 0 &&
                        selectedUsers.length > 0
                      ) {
                        handleRemoveUser(
                          selectedUsers[selectedUsers.length - 1].id,
                        );
                      }
                    }}
                  />
                </Combobox.EventsTarget>
              </Pill.Group>
            </PillsInput>
          </Combobox.DropdownTarget>

          <Combobox.Dropdown>
            <Combobox.Options>
              <ScrollArea.Autosize mah={250} type="scroll">
                {filteredUsers.length === 0 ? (
                  <Combobox.Empty>
                    {searchText
                      ? t`No users found matching "${searchText}"`
                      : t`All users are already analysts`}
                  </Combobox.Empty>
                ) : (
                  filteredUsers.map((user) => (
                    <Combobox.Option
                      key={user.id}
                      value={String(user.id)}
                      py="xs"
                    >
                      <Flex align="center" gap="sm">
                        <Box fz="0.75em">
                          <UserAvatar user={user} />
                        </Box>
                        <Stack gap={0}>
                          <Text fw={500}>
                            {getFullName(user) || user.email}
                          </Text>
                          <Text c="text-secondary" size="sm">
                            {user.email}
                          </Text>
                        </Stack>
                      </Flex>
                    </Combobox.Option>
                  ))
                )}
              </ScrollArea.Autosize>
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>

        <Group mt="md" justify="flex-end">
          <Button onClick={handleClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            onClick={handleInvite}
            disabled={selectedUsers.length === 0}
            loading={isAddingAnalyst}
          >
            {t`Invite`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModalTitle() {
  return (
    <Group gap="sm">
      <Center w="2rem" h="2rem" c="brand" bg="brand-light" bdrs="md">
        <FixedSizeIcon name="group" />
      </Center>
      <Title order={3}>{t`Invite analysts`}</Title>
    </Group>
  );
}
