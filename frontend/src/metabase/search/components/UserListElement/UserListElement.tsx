import { Button, Text } from "metabase/ui";
import type { UserListResult } from "metabase-types/api";

import Styles from "./UserListElement.module.css";

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
  <Button
    data-testid="user-list-element"
    onClick={() => onClick(value)}
    data-is-selected={isSelected}
    px="sm"
    py="xs"
    variant="subtle"
    bg={isSelected ? "brand" : undefined}
    justify="start"
    classNames={{
      root: Styles.Root,
    }}
  >
    <Text fw={700} color={isSelected ? "brand" : undefined} truncate>
      {value.common_name}
    </Text>
  </Button>
);
