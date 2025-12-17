import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Flex, Icon } from "metabase/ui";

import type { TreeTableHeaderVariant } from "../../types";

import S from "./HeaderCell.module.css";

interface HeaderCellProps {
  name: string;
  sort?: "asc" | "desc";
  variant: TreeTableHeaderVariant;
}

export function HeaderCell({ name, sort, variant }: HeaderCellProps) {
  const sortIcon = sort && (
    <Icon
      name={sort === "asc" ? "chevronup" : "chevrondown"}
      size={10}
      className={S.sortIcon}
    />
  );

  if (variant === "pill") {
    return (
      <Flex
        className={S.pill}
        align="center"
        gap="0.25rem"
        py="0.25rem"
        px="0.625rem"
        fz="0.75rem"
        fw={700}
        c="brand"
      >
        <Ellipsified tooltip={name}>{name}</Ellipsified>
        {sortIcon}
      </Flex>
    );
  }

  return (
    <Flex
      component="span"
      align="center"
      gap="0.25rem"
      fz="0.75rem"
      fw={700}
      c="text-medium"
    >
      {name}
      {sortIcon}
    </Flex>
  );
}
