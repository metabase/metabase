/* eslint-disable react/prop-types */
import { useState } from "react";
import { isEqual } from "underscore";
import { t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import type { UserListResult } from "metabase-types/api";
import { Center, Text, TextInput } from "metabase/ui";
import {
  CreatedByContainer,
  CreatedByContentContainer,
} from "metabase/search/components/filters/CreatedByFilter/CreatedByContent.styled";
import type { SearchFilterDropdown } from "metabase/search/types";
import { UserListElement } from "metabase/search/components/filters/CreatedByFilter/UserListElement";
import { SearchFilterPopoverWrapper } from "metabase/search/components/SearchSidebar/DropdownSidebarFilter/SearchFilterPopoverWrapper";

export const CreatedByContent: SearchFilterDropdown<"created_by">["ContentComponent"] =
  ({ value, onChange }) => {
    const { data: users = [], isLoading } = useUserListQuery();

    const [selectedUserId, setSelectedUserId] = useState(value);
    const [userFilter, setUserFilter] = useState("");

    const filteredUsers = users.filter(user => {
      return user.common_name.toLowerCase().includes(userFilter.toLowerCase());
    });

    const onUserSelect = (user: UserListResult) => {
      if (selectedUserId && isEqual(selectedUserId, user.id)) {
        setSelectedUserId(undefined);
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
        <CreatedByContainer p="sm" h="100%" spacing="xs">
          <TextInput
            size="md"
            mb="sm"
            placeholder={t`Search for users…`}
            value={userFilter}
            tabIndex={0}
            onChange={event => setUserFilter(event.currentTarget.value)}
          />
          {filteredUsers.length > 0 ? (
            <CreatedByContentContainer h="100%" spacing="xs" p="xs">
              {generateUserListElements(filteredUsers)}
            </CreatedByContentContainer>
          ) : (
            <Center py="md">
              <Text size="md" weight={700}>{t`No users found.`}</Text>
            </Center>
          )}
        </CreatedByContainer>
      </SearchFilterPopoverWrapper>
    );
  };
