import { Text } from "metabase/ui";
import type { UserListResult } from "metabase-types/api";

import { UserElement } from "./UserListElement.styled";

export type UserListElementProps = {
  value: UserListResult;
  onClick: (value: UserListResult) => void;
  isSelected: boolean;
};

export const UserListElement = ({
  value,
  isSelected,
  onClick,
}: UserListElementProps) => (
  <UserElement
    data-testid="user-list-element"
    onClick={() => onClick(value)}
    data-is-selected={isSelected}
    px="sm"
    py="xs"
    variant="subtle"
    bg={isSelected ? "brand" : undefined}
  >
    <Text weight={700} color={isSelected ? "brand" : undefined} truncate>
      {value.common_name}
    </Text>
  </UserElement>
);
