import {
  type ChangeEvent,
  type ClipboardEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { userToColor } from "metabase/admin/people/colors";
import { useListUsersQuery } from "metabase/api";
import { UserAvatar } from "metabase/common/components/UserAvatar";
import {
  Box,
  Button,
  Flex,
  Input,
  Pill,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { Member, User } from "metabase-types/api";

const MAX_SELECTED_USERS = 100;

type Props = {
  hasCurrentUsers: boolean;
  members: Member[];
  onAddUsers: (userIds: number[]) => void;
  onCancel: () => void;
};

export const AddDataAppUsers = ({
  hasCurrentUsers,
  members,
  onAddUsers,
  onCancel,
}: Props) => {
  const [text, setText] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(true);

  const [selectedUsers, setSelectedUsers] = useState<Map<number, User>>(
    new Map(),
  );

  const { data, error, isLoading } = useListUsersQuery({ tenancy: "internal" });

  const memberIds = useMemo(
    () => new Set(members.map(({ user_id }) => user_id)),
    [members],
  );

  const suggestedUsers = useMemo(() => {
    const input = text.toLowerCase();

    return (data?.data ?? []).filter(
      (user) =>
        user.is_active &&
        user.tenant_id == null &&
        !memberIds.has(user.id) &&
        !selectedUsers.has(user.id) &&
        ((user.common_name ?? "").toLowerCase().includes(input) ||
          user.email.toLowerCase().includes(input)),
    );
  }, [data, memberIds, selectedUsers, text]);

  const addUser = (user: User) => {
    if (selectedUsers.size >= MAX_SELECTED_USERS) {
      return;
    }

    setSelectedUsers(new Map(selectedUsers).set(user.id, user));

    setText("");
    setIsPickerOpen(false);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const emails = event.clipboardData
      .getData("text")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    if (emails.length < 2) {
      return;
    }

    const usersByEmail = new Map(
      (data?.data ?? []).map((user) => [user.email.toLowerCase(), user]),
    );

    const nextUsers = new Map(selectedUsers);
    const unmatchedEmails: string[] = [];

    for (const email of emails) {
      const user = usersByEmail.get(email.toLowerCase());

      const canAdd =
        user?.is_active &&
        user.tenant_id == null &&
        !memberIds.has(user.id) &&
        nextUsers.size < MAX_SELECTED_USERS;

      if (user && canAdd) {
        nextUsers.set(user.id, user);
      } else {
        unmatchedEmails.push(email);
      }
    }

    if (nextUsers.size > selectedUsers.size) {
      event.preventDefault();

      setSelectedUsers(nextUsers);
      setText(unmatchedEmails.join(", "));
      setIsPickerOpen(false);
    }
  };

  const removeUser = (user: User) => {
    const nextUsers = new Map(selectedUsers);

    nextUsers.delete(user.id);
    setSelectedUsers(nextUsers);
  };

  return (
    <Popover
      opened={isPickerOpen && !isLoading && !error && suggestedUsers.length > 0}
      onChange={setIsPickerOpen}
      position="bottom-start"
      shadow="md"
    >
      <Popover.Target>
        <Box
          mx={hasCurrentUsers ? "-1px" : 0}
          mt={hasCurrentUsers ? "-1px" : 0}
        >
          <AddUsersRow
            value={text}
            isValid={selectedUsers.size > 0}
            hasCurrentUsers={hasCurrentUsers}
            placeholder={t`Pick someone from the list, or paste a list of email addresses separated by commas`}
            ariaLabel={t`Search for a user to add`}
            onChange={(event) => {
              setText(event.target.value);
              setIsPickerOpen(true);
            }}
            onPaste={handlePaste}
            onDone={() => onAddUsers(Array.from(selectedUsers.keys()))}
            onCancel={onCancel}
          >
            {Array.from(selectedUsers.values()).map((user, index) => (
              <Pill
                key={user.id}
                size="md"
                ms={index > 0 ? "sm" : ""}
                withRemoveButton
                onRemove={() => removeUser(user)}
              >
                {user.common_name}
              </Pill>
            ))}
          </AddUsersRow>
        </Box>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap={0} miw="15rem">
          {suggestedUsers.map((user) => (
            <Flex
              key={user.id}
              component={UnstyledButton}
              align="center"
              gap="md"
              p="0.5rem 1rem"
              onClick={() => addUser(user)}
            >
              <UserAvatar bg={userToColor(user)} user={user} />
              <Text fw="bold" size="lg">
                {user.common_name}
              </Text>
            </Flex>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

interface AddUsersRowProps {
  value: string;
  isValid: boolean;
  hasCurrentUsers: boolean;
  placeholder: string;
  ariaLabel: string;
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDone: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

const AddUsersRow = ({
  value,
  isValid,
  hasCurrentUsers,
  placeholder,
  ariaLabel,
  onPaste,
  onChange,
  onDone,
  onCancel,
  children,
}: AddUsersRowProps) => (
  <Flex
    p="0.5rem"
    align="center"
    bd="1px solid var(--mb-color-core-brand)"
    style={{
      borderRadius: hasCurrentUsers ? "0.5rem 0.5rem 0 0" : "0.5rem",
      borderBottomWidth: hasCurrentUsers ? 0 : undefined,
    }}
  >
    {children}

    <Input
      type="text"
      variant="unstyled"
      flex="1 0 auto"
      fz="lg"
      styles={{ input: { background: "transparent" } }}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus
      onPaste={onPaste}
      onChange={onChange}
    />

    <Button variant="subtle" bg="transparent" onClick={onCancel} mr="sm">
      {t`Cancel`}
    </Button>

    <Button
      variant={isValid ? "filled" : "outline"}
      disabled={!isValid}
      onClick={onDone}
    >
      {t`Add`}
    </Button>
  </Flex>
);
