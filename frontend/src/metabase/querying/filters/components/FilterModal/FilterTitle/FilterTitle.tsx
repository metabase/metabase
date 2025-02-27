import type { ReactNode } from "react";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import type { IconName } from "metabase/ui";
import { Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { useFilterModalContext } from "../context";

import { FilterColumnName } from "./FilterColumnName";

type FilterTitleProps = {
  children?: ReactNode;
  column: Lib.ColumnMetadata;
  columnIcon: IconName;
  stageIndex: number;
};

export { HoverParent };

export function FilterTitle({
  children,
  column,
  columnIcon,
  stageIndex,
}: FilterTitleProps) {
  const { query } = useFilterModalContext();

  return (
    <Flex h="100%" align="center" gap="sm" pl="md">
      <QueryColumnInfoIcon
        query={query}
        stageIndex={stageIndex}
        column={column}
        icon={columnIcon}
        position="left"
      />
      <FilterColumnName stageIndex={stageIndex} column={column} />
      {children}
    </Flex>
  );
}
