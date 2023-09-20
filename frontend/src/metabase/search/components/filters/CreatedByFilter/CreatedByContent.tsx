/* eslint-disable react/prop-types */
import { useState } from "react";
import { isEqual } from "underscore";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import type { UserListResult } from "metabase-types/api";
import { Loader, TextInput, Text, Center, Stack } from "metabase/ui";
import {
  CreatedByContainer,
  UserElement,
} from "metabase/search/components/filters/CreatedByFilter/CreatedByContent.styled";
import type { SearchSidebarFilterComponent } from "metabase/search/types";

const UserListElement = ({
  value,
  isSelected,
  onClick,
}: {
  value: UserListResult;
  onClick: (value: UserListResult) => void;
  isSelected: boolean;
}) => {
  return (
    <UserElement
      onClick={() => onClick(value)}
      isSelected={isSelected}
      px="sm"
      py="xs"
    >
      <Text weight={700} color={isSelected ? "brand.1" : undefined}>
        {value.common_name}
      </Text>
    </UserElement>
  );
};
export const CreatedByContent: SearchSidebarFilterComponent<"created_by">["ContentComponent"] =
  ({ value, onChange }) => {
    const { data: users = [], isLoading } = useUserListQuery();
    const [userFilter, setUserFilter] = useState("");

    const filteredUsers = users.filter(user =>
      user.common_name.toLowerCase().includes(userFilter.toLowerCase()),
    );

    const onUserSelect = (user: UserListResult) => {
      if (value && value.length > 0 && isEqual(value[0], String(user.id))) {
        onChange([]);
      } else {
        onChange([String(user.id)]);
      }
    };

    return isLoading ? (
      <Center>
        <Loader data-testid="loading-spinner" />
      </Center>
    ) : (
      <CreatedByContainer p="md" h="100%" spacing="xs">
        <TextInput
          size="sm"
          mb="sm"
          value={userFilter}
          onChange={event => setUserFilter(event.currentTarget.value)}
        />
        <Stack
          h="100%"
          style={{
            overflowY: "auto",
          }}
        >
          <Stack spacing="xs">
            {filteredUsers.map(user => (
              <UserListElement
                key={user.id}
                isSelected={
                  value && value.length > 0
                    ? isEqual(value[0], String(user.id))
                    : false
                }
                onClick={onUserSelect}
                value={user}
              />
            ))}
          </Stack>
        </Stack>
      </CreatedByContainer>
    );
  };
