import type { UserListResult } from "metabase-types/api";
import type { ButtonProps } from "metabase/ui";
import { Text } from "metabase/ui";
import { UserElement } from "./UserListElement.styled";

export type UserListElementProps = {
  value: UserListResult;
  onClick: (value: UserListResult) => void;
  isSelected: boolean;
} & ButtonProps;

export const UserListElement = ({
  value,
  isSelected,
  onClick,
  ...buttonProps
}: UserListElementProps) => (
  <UserElement
    data-testid="user-list-element"
    onClick={() => onClick(value)}
    data-is-selected={isSelected}
    px="sm"
    py="xs"
    variant="subtle"
    bg={isSelected ? "brand.0" : undefined}
    {...buttonProps}
  >
    <Text weight={700} color={isSelected ? "brand.1" : undefined} truncate>
      {value.common_name}
    </Text>
  </UserElement>
);
