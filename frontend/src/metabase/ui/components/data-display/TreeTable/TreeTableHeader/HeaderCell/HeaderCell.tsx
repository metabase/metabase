import { memo } from "react";

import { Flex, Icon, SortableHeaderPill } from "metabase/ui";

import type { TreeTableHeaderVariant } from "../../types";

interface HeaderCellProps {
  name: string;
  sort?: "asc" | "desc";
  variant: TreeTableHeaderVariant;
}

export const HeaderCell = memo(function HeaderCell({
  name,
  sort,
  variant,
}: HeaderCellProps) {
  if (variant === "pill") {
    return <SortableHeaderPill name={name} sort={sort} />;
  }

  return (
    <Flex
      component="span"
      align="center"
      gap="0.25rem"
      fz="0.75rem"
      fw={700}
      c="text-secondary"
    >
      {name}
      {sort && (
        <Icon name={sort === "asc" ? "chevronup" : "chevrondown"} size={10} />
      )}
    </Flex>
  );
});
