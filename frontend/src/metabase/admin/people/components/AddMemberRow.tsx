import { useMemo, useState } from "react";
import { t } from "ttag";

import UserAvatar from "metabase/components/UserAvatar";
import { Flex, Pill, Popover, Text, UnstyledButton } from "metabase/ui";
import type { User } from "metabase-types/api";

import { userToColor } from "../colors";

import { AddRow } from "./AddRow";

interface AddMemberRowProps {
  users: User[];
  excludeIds: Set<number>;
  onCancel: () => void;
  onDone: (userIds: number[]) => void;
}

export function AddMemberRow({
  users,
  excludeIds,
  onCancel,
  onDone,
}: AddMemberRowProps) {
  const [text, setText] = useState("");
  const [selectedUsersById, setSelectedUsersById] = useState<Map<number, User>>(
    new Map(),
  );

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

  const availableToSelectUsers = useMemo(
    () =>
      users.filter(
        (user) => !selectedUsersById.has(user.id) && !excludeIds.has(user.id),
      ),
    [selectedUsersById, excludeIds, users],
  );

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
                    ml={index > 0 ? "sm" : ""}
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
                  <Text fw="700" size="lg">
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
