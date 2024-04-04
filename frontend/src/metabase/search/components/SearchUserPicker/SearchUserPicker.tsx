import { useState } from "react";
import { t } from "ttag";
import { without } from "underscore";

import { useUserListQuery } from "metabase/common/hooks";
import { SearchFilterPopoverWrapper } from "metabase/search/components/SearchFilterPopoverWrapper";
import {
  SearchUserItemContainer,
  SearchUserPickerContainer,
  SearchUserPickerContent,
  SearchUserSelectBox,
  SelectedUserButton,
  UserPickerInput,
} from "metabase/search/components/SearchUserPicker/SearchUserPicker.styled";
import { UserListElement } from "metabase/search/components/UserListElement";
import { Center, Text, Icon } from "metabase/ui";
import type { UserId, UserListResult } from "metabase-types/api";

export const SearchUserPicker = ({
  value,
  onChange,
}: {
  value: UserId[];
  onChange: (value: UserId[]) => void;
}) => {
  const { isLoading, data } = useUserListQuery({
    query: { recipients: true },
  });

  const users = data ?? [];

  const [userFilter, setUserFilter] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState(value);

  const isSelected = (user: UserListResult) =>
    selectedUserIds.includes(user.id);

  const filteredUsers = users.filter(user => {
    return (
      user.common_name.toLowerCase().includes(userFilter.toLowerCase()) &&
      !isSelected(user)
    );
  });

  const removeUser = (user?: UserListResult) => {
    if (user) {
      setSelectedUserIds(without(selectedUserIds, user.id));
    }
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

  const generateUserListElements = (userList: UserListResult[]) => {
    return userList.map(user => (
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
      <SearchUserPickerContainer p="sm" spacing="xs">
        <SearchUserSelectBox spacing={0}>
          <SearchUserItemContainer
            data-testid="search-user-select-box"
            spacing="xs"
            p="xs"
            mah="30vh"
          >
            {selectedUserIds.map(userId => {
              const user = users.find(user => user.id === userId);
              return (
                <SelectedUserButton
                  data-testid="selected-user-button"
                  key={userId}
                  c="brand"
                  px="md"
                  py="sm"
                  maw="100%"
                  rightIcon={<Icon name="close" />}
                  onClick={() => removeUser(user)}
                >
                  <Text align="left" w="100%" truncate c="inherit">
                    {user?.common_name}
                  </Text>
                </SelectedUserButton>
              );
            })}
            <UserPickerInput
              variant="unstyled"
              pl="sm"
              size="md"
              placeholder={t`Search for someone…`}
              value={userFilter}
              tabIndex={0}
              onChange={event => setUserFilter(event.currentTarget.value)}
              mt="-0.25rem"
              miw="18ch"
            />
          </SearchUserItemContainer>
        </SearchUserSelectBox>
        <SearchUserPickerContent
          data-testid="search-user-list"
          h="100%"
          spacing="xs"
          p="xs"
        >
          {filteredUsers.length > 0 ? (
            generateUserListElements(filteredUsers)
          ) : (
            <Center py="md">
              <Text size="md" weight={700}>{t`No results`}</Text>
            </Center>
          )}
        </SearchUserPickerContent>
      </SearchUserPickerContainer>
    </SearchFilterPopoverWrapper>
  );
};
