import type { UserListResult } from "metabase-types/api";
import { UserElement } from "metabase/search/components/filters/CreatedByFilter/CreatedByContent.styled";
import { Text } from "metabase/ui";

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
    isSelected={isSelected}
    data-is-selected={isSelected}
    px="sm"
    py="xs"
  >
    <Text weight={700} color={isSelected ? "brand.1" : undefined}>
      {value.common_name || `${value.first_name} ${value.last_name}`}
    </Text>
  </UserElement>
);
