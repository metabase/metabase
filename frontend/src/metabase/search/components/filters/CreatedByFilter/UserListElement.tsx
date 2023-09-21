import type { UserListResult } from "metabase-types/api";
import { Text } from "metabase/ui";
import { getUserDisplayName } from "metabase/search/utils/user-name/user-name";
import { UserElement } from "metabase/search/components/filters/CreatedByFilter/UserListElement.styled";

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
    bg={isSelected ? "brand.0" : undefined}
  >
    <Text weight={700} color={isSelected ? "brand.1" : undefined} truncate>
      {getUserDisplayName(value)}
    </Text>
  </UserElement>
);
