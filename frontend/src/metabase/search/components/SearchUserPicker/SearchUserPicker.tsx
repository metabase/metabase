import { useState } from "react";
import { t } from "ttag";
import { without } from "underscore";

import { useListUserRecipientsQuery } from "metabase/api";
import { SearchFilterPopoverWrapper } from "metabase/search/components/SearchFilterPopoverWrapper";
import { UserListElement } from "metabase/search/components/UserListElement";
import { Center, Pill, PillsInput, Stack, Text } from "metabase/ui";
import type { UserId, UserListResult } from "metabase-types/api";

import S from "./SearchUserPicker.module.css";

export const SearchUserPicker = ({
  value,
  width,
  onChange,
}: {
  value: UserId[];
  width?: string;
  onChange: (value: UserId[]) => void;
}) => {
  const { isLoading, data } = useListUserRecipientsQuery();

  const users = data?.data ?? [];

  const [userFilter, setUserFilter] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState(value);

  const isSelected = (user: UserListResult) =>
    selectedUserIds.includes(user.id);

  const filteredUsers = users.filter((user) => {
    return (
      user.common_name.toLowerCase().includes(userFilter.toLowerCase()) &&
      !isSelected(user)
    );
  });

  const removeUser = (user: UserListResult) => {
    setSelectedUserIds(without(selectedUserIds, user.id));
  };

  const addUser = (user: UserListResult) => {
    setSelectedUserIds([...selectedUserIds, user.id]);
  };

  const onUserSelect = (user: UserListResult) => {
    if (isSelected(user)) {
      removeUser(user);
    } else {
      addUser(user);
    }
  };

  const selectedUsers = selectedUserIds.flatMap((userId) => {
    const user = users.find((user) => user.id === userId);
    return user ? [user] : [];
  });

  const generateUserListElements = (userList: UserListResult[]) => {
    return userList.map((user) => (
      <UserListElement
        key={user.id}
        isSelected={isSelected(user)}
        onClick={onUserSelect}
        value={user}
      />
    ));
  };

  return (
    <SearchFilterPopoverWrapper
      isLoading={isLoading}
      onApply={() => onChange(selectedUserIds)}
    >
      <Stack className={S.container} w={width} p="sm" gap="xxs">
        <PillsInput
          data-testid="search-user-select-box"
          classNames={{ input: S.selectBox }}
        >
          <Pill.Group>
            {selectedUsers.map((user) => (
              <Pill
                key={user.id}
                data-testid="selected-user-button"
                withRemoveButton
                removeButtonProps={{
                  "aria-label": t`Remove ${user.common_name}`,
                  "aria-hidden": false,
                }}
                onRemove={() => removeUser(user)}
              >
                {user.common_name}
              </Pill>
            ))}
            <PillsInput.Field
              placeholder={t`Search for someone…`}
              value={userFilter}
              onChange={(event) => setUserFilter(event.currentTarget.value)}
            />
          </Pill.Group>
        </PillsInput>
        <Stack
          className={S.content}
          data-testid="search-user-list"
          flex="1"
          gap="xxs"
          p="xxs"
        >
          {filteredUsers.length > 0 ? (
            generateUserListElements(filteredUsers)
          ) : (
            <Center py="lg">
              <Text size="md" fw={700}>{t`No results`}</Text>
            </Center>
          )}
        </Stack>
      </Stack>
    </SearchFilterPopoverWrapper>
  );
};
