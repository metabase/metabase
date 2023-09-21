import type { UserListResult } from "metabase-types/api";
import { UserElement } from "metabase/search/components/filters/CreatedByFilter/CreatedByContent.styled";
import { Text } from "metabase/ui";
import { getUserDisplayName } from "metabase/search/utils/user-name/user-name";

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
      {getUserDisplayName(value)}
    </Text>
  </UserElement>
);
