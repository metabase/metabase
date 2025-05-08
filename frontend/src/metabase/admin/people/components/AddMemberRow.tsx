import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import UserAvatar from "metabase/components/UserAvatar";
import { Flex, Pill, Popover, Text, UnstyledButton } from "metabase/ui";
import type { Member, User } from "metabase-types/api";

import { userToColor } from "../colors";

import { AddRow } from "./AddRow";

interface AddMemberRowProps {
  members: Member[];
  onCancel: () => void;
  onDone: (userIds: number[]) => void;
}

export function AddMemberRow({ members, onCancel, onDone }: AddMemberRowProps) {
  const listUsersReq = useListUsersQuery();
  const [text, setText] = useState("");
  const [selectedUsersById, setSelectedUsersById] = useState<Map<number, User>>(
    new Map(),
  );

  const availableToSelectUsers = useMemo(() => {
    const { isLoading, error, data } = listUsersReq;
    if (isLoading || error) {
      return [];
    }
    const allUsers = data?.data ?? [];
    const groupMemberIds = new Set(members.map((m) => m.user_id));
    return allUsers.filter(
      ({ id }) => !selectedUsersById.has(id) && !groupMemberIds.has(id),
    );
  }, [members, selectedUsersById, listUsersReq]);

  const handleRemoveUser = (user: User) => {
    const newSelectedUsersById = new Map(selectedUsersById);
    newSelectedUsersById.delete(user.id);
    setSelectedUsersById(newSelectedUsersById);
  };

  const handleAddUser = (user: User) => {
    const newSelectedUsersById = new Map(selectedUsersById);
    newSelectedUsersById.set(user.id, user);
    setSelectedUsersById(newSelectedUsersById);
    setText("");
  };

  const handleDone = () => {
    onDone(Array.from(selectedUsersById.keys()));
  };

  const suggestedUsers = useMemo(() => {
    const input = text.toLowerCase();
    return availableToSelectUsers.filter((user) =>
      (user.common_name || "").toLowerCase().includes(input),
    );
  }, [availableToSelectUsers, text]);

  return (
    <tr>
      <td colSpan={4} style={{ padding: 0 }}>
        <Popover
          opened={suggestedUsers.length > 0}
          position="bottom-start"
          withArrow
          shadow="md"
        >
          <Popover.Target>
            <div>
              <AddRow
                value={text}
                isValid={selectedUsersById.size > 0}
                placeholder={t`Julie McMemberson`}
                onChange={(e) => setText(e.target.value)}
                onDone={handleDone}
                onCancel={onCancel}
              >
                {Array.from(selectedUsersById.values()).map((user, index) => (
                  <Pill
                    key={user.id}
                    size="xl"
                    bg="bg-medium"
                    c="text-primary"
                    ms={index > 0 ? "sm" : ""}
                    withRemoveButton
                    onRemove={() => handleRemoveUser(user)}
                  >
                    {user.common_name}
                  </Pill>
                ))}
              </AddRow>
            </div>
          </Popover.Target>

          <Popover.Dropdown>
            <Flex direction="column" p="xs" miw="15rem">
              {suggestedUsers.map((user: User, index: number) => (
                <Flex
                  key={index}
                  component={UnstyledButton}
                  align="center"
                  gap="md"
                  p="0.5rem 1rem"
                  onClick={() => handleAddUser(user)}
                >
                  <UserAvatar bg={userToColor(user)} user={user} />
                  <Text fw="bold" size="lg">
                    {user.common_name}
                  </Text>
                </Flex>
              ))}
            </Flex>
          </Popover.Dropdown>
        </Popover>
      </td>
    </tr>
  );
}
