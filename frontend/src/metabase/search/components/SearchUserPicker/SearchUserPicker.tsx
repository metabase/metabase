/* eslint-disable react/prop-types */
import { useState } from "react";
import { isEqual } from "underscore";
import { t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import type { UserId, UserListResult } from "metabase-types/api";
import { UserListElement } from "metabase/search/components/UserListElement";
import { SearchFilterPopoverWrapper } from "metabase/search/components/SearchSidebar/DropdownSidebarFilter/SearchFilterPopoverWrapper";
import {
  SearchUserPickerContainer,
  SearchUserPickerContent,
} from "metabase/search/components/SearchUserPicker/SearchUserPicker.styled";
import { Center, Text, TextInput } from "metabase/ui";

export const SearchUserPicker = ({
  value,
  onChange,
}: {
  value: UserId | null;
  onChange: (value: UserId | null) => void;
}) => {
  const { data: users = [], isLoading } = useUserListQuery();
  const [userFilter, setUserFilter] = useState("");

  const [selectedUserId, setSelectedUserId] = useState(value);

  const filteredUsers = users.filter(user => {
    return user.common_name.toLowerCase().includes(userFilter.toLowerCase());
  });

  const onUserSelect = (user: UserListResult) => {
    if (selectedUserId && isEqual(selectedUserId, user.id)) {
      setSelectedUserId(null);
    } else {
      setSelectedUserId(user.id);
    }
  };

  const generateUserListElements = (userList: UserListResult[]) => {
    return userList.map(user => (
      <UserListElement
        key={user.id}
        isSelected={selectedUserId ? isEqual(selectedUserId, user.id) : false}
        onClick={onUserSelect}
        value={user}
      />
    ));
  };

  return (
    <SearchFilterPopoverWrapper
      isLoading={isLoading}
      onApply={() => onChange(selectedUserId)}
    >
      <SearchUserPickerContainer p="sm" h="100%" spacing="xs">
        <TextInput
          size="md"
          mb="sm"
          placeholder={t`Search for users…`}
          value={userFilter}
          tabIndex={0}
          onChange={event => setUserFilter(event.currentTarget.value)}
        />
        {filteredUsers.length > 0 ? (
          <SearchUserPickerContent h="100%" spacing="xs" p="xs">
            {generateUserListElements(filteredUsers)}
          </SearchUserPickerContent>
        ) : (
          <Center py="md">
            <Text size="md" weight={700}>{t`No users found.`}</Text>
          </Center>
        )}
      </SearchUserPickerContainer>
    </SearchFilterPopoverWrapper>
  );
};
