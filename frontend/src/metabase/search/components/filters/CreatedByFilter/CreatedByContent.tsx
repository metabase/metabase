/* eslint-disable react/prop-types */
import { useState } from "react";
import { isEqual } from "underscore";
import { t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import type { UserListResult } from "metabase-types/api";
import { Center, Loader, Text, TextInput } from "metabase/ui";
import {
  CreatedByContainer,
  CreatedByContentContainer,
} from "metabase/search/components/filters/CreatedByFilter/CreatedByContent.styled";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { UserListElement } from "metabase/search/components/filters/CreatedByFilter/UserListElement";
import { getUserDisplayName } from "metabase/search/utils/user-name/user-name";
import { createMockUserListResult } from "metabase-types/api/mocks";

const generateUsers = () => {
  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push(
      createMockUserListResult({
        id: i + 1000,
        common_name: `Anna Konstantynopolitańczykiewiczówna ${i}`,
      }),
    );
  }
  return users;
};
const TEST_USERS = generateUsers();

export const CreatedByContent: SearchSidebarFilterComponent<"created_by">["ContentComponent"] =
  ({ value, onChange }) => {
    const { data: users = [], isLoading } = useUserListQuery();
    const [userFilter, setUserFilter] = useState("");

    const filteredUsers = [...TEST_USERS, ...users].filter(user => {
      const userDisplayName = getUserDisplayName(user);
      return userDisplayName.toLowerCase().includes(userFilter.toLowerCase());
    });

    const onUserSelect = (user: UserListResult) => {
      if (value && isEqual(value, user.id)) {
        onChange(undefined);
      } else {
        onChange(user.id);
      }
    };

    if (isLoading) {
      return (
        <Center>
          <Loader data-testid="loading-spinner" />
        </Center>
      );
    }

    return (
      <CreatedByContainer p="sm" h="100%" spacing="xs">
        <TextInput
          size="md"
          mb="sm"
          placeholder="Search for users…"
          value={userFilter}
          tabIndex={0}
          onChange={event => setUserFilter(event.currentTarget.value)}
        />
        {filteredUsers.length > 0 ? (
          <CreatedByContentContainer h="100%" spacing="xs">
            {filteredUsers.map(user => (
              <UserListElement
                key={user.id}
                isSelected={value ? isEqual(value, user.id) : false}
                onClick={onUserSelect}
                value={user}
              />
            ))}
          </CreatedByContentContainer>
        ) : (
          <Center py="md">
            <Text size="md" weight={700}>{t`No users found.`}</Text>
          </Center>
        )}
      </CreatedByContainer>
    );
  };
